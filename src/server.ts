import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { closeDatabase, initializeDatabase } from "./db.js";
import { currentUser, login, logout, requireAuth, signup } from "./auth.js";
import { aiChat } from "./ai.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const allowedOrigins = new Set(
  (process.env.APP_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
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
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && origin && !allowedOrigins.has(origin)) {
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

app.get("/health", (_req, res) => res.json({ status: "ok" }));
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a little before trying again." }
});

app.post("/api/chat", aiLimiter, aiChat);
app.post("/auth/signup", authLimiter, signup);
app.post("/auth/login", authLimiter, login);
app.get("/auth/me", requireAuth, currentUser);
app.post("/auth/logout", requireAuth, logout);

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
