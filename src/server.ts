import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import { resolve } from "node:path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { closeDatabase, initializeDatabase, pool } from "./db.js";
import { currentUser, login, logout, requireAuth, signup } from "./auth.js";
import { aiChat, getLatestChatHistory } from "./ai.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const allowedOrigins = new Set(
  (process.env.APP_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet({
  // The current single-file frontend intentionally uses inline CSS/JS.
  // Previewed user HTML stays in a sandboxed iframe without same-origin access.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.get("Origin");
  const sameHostOrigin = (() => {
    if (!origin) return false;
    try { return new URL(origin).host === req.get("host"); } catch { return false; }
  })();
  const originAllowed = !!origin && (allowedOrigins.has(origin) || sameHostOrigin);
  if (originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  } else if (origin) {
    res.status(403).json({ error: "Origin not allowed." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && origin && !originAllowed) {
    res.status(403).json({ error: "Origin not allowed." });
    return;
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." }
});

// A successful health check now means the database is reachable too.
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

// Read-only, fixed-target diagnostic: this checks the published Princess AI page,
// not its private chat endpoint, provider credentials, or runtime logs.
const princessDiagnosticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many diagnostic checks. Wait a minute and try again." }
});
app.get("/api/diagnostics/princess", princessDiagnosticsLimiter, async (_req, res) => {
  const target = "https://princess-ai.floot.app/";
  const startedAt = Date.now();
  const checkedAt = () => new Date().toISOString();
  try {
    const response = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Monarch-Princess-Diagnostics/1.0" }
    });
    const contentType = response.headers.get("content-type") ?? "unknown";
    let title: string | null = null;
    let appShell = false;
    if (contentType.toLowerCase().includes("text/html")) {
      const html = await response.text();
      title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null;
      appShell = /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      target,
      networkReachable: true,
      httpOk: response.ok,
      httpStatus: response.status,
      contentType,
      latencyMs: Date.now() - startedAt,
      title,
      appShell,
      checkedAt: checkedAt(),
      note: "This checks only the published page. It does not verify chat requests, AI provider credentials, or the app's private runtime logs."
    });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      target,
      networkReachable: false,
      httpOk: false,
      httpStatus: null,
      contentType: null,
      latencyMs: Date.now() - startedAt,
      title: null,
      appShell: false,
      checkedAt: checkedAt(),
      error: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Timed out while checking the published page."
        : "Monarch could not reach the published page from its server.",
      note: "This checks only the published page. A failed check does not by itself prove the chat API is broken."
    });
  }
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a little before trying again." }
});

app.post("/api/chat", requireAuth, aiLimiter, aiChat);
app.get("/api/chat/history/latest", requireAuth, getLatestChatHistory);
app.post("/auth/signup", authLimiter, signup);
app.post("/auth/login", authLimiter, login);
app.get("/auth/me", requireAuth, currentUser);
app.post("/auth/logout", requireAuth, logout);

// Serve the frontend from the same host as the API when deployed as one app.
app.use(express.static(resolve(process.cwd(), "app")));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Do not expose internal errors or secrets to clients.
  console.error("Unhandled request error", error instanceof Error ? error.message : "unknown error");
  res.status(500).json({ error: "Internal server error." });
};
app.use(errorHandler);

const portSchema = z.number().int().min(1).max(65535);
if (!portSchema.safeParse(port).success) throw new Error("PORT must be between 1 and 65535");

await initializeDatabase();
const server = app.listen(port, () => {
  console.log(`Monarch auth API listening on port ${port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closeDatabase();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
