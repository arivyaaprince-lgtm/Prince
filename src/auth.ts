import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { pool } from "./db.js";

const SESSION_COOKIE = "monarch_session";
const SESSION_DAYS = 7;
const pepper = process.env.SESSION_TOKEN_PEPPER;
if (!pepper || Buffer.byteLength(pepper) < 32) {
  throw new Error("SESSION_TOKEN_PEPPER must contain at least 32 bytes");
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128)
});

type User = { id: string; email: string; created_at: Date };
declare global {
  namespace Express {
    interface Request { authUser?: User }
  }
}

function digestToken(token: string): string {
  return createHash("sha256").update(token).update(pepper).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  };
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digestToken(token);
  await pool.query(
    "INSERT INTO monarch_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
    [userId, tokenHash]
  );
  setSessionCookie(res, token);
}

export async function signup(req: Request, res: Response): Promise<void> {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and a password of 12–128 characters." });
    return;
  }

  const { email, password } = parsed.data;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    const result = await pool.query<User>(
      "INSERT INTO monarch_users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, passwordHash]
    );
    const user = result.rows[0];
    await createSession(user.id, res);
    res.status(201).json({ user: { id: user.id, email: user.email, createdAt: user.created_at } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "Unable to create an account with those details." });
      return;
    }
    throw error;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password." });
    return;
  }

  const { email, password } = parsed.data;
  const result = await pool.query<User & { password_hash: string }>(
    "SELECT id, email, password_hash, created_at FROM monarch_users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  const valid = user
    ? await argon2.verify(user.password_hash, password).catch(() => false)
    : false;
  if (!user || !valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  await createSession(user.id, res);
  res.json({ user: { id: user.id, email: user.email, createdAt: user.created_at } });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 40 || token.length > 100) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const result = await pool.query<User>(
    `SELECT u.id, u.email, u.created_at
     FROM monarch_sessions s
     JOIN monarch_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [digestToken(token)]
  );
  const user = result.rows[0];
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  req.authUser = user;
  next();
}

export async function currentUser(req: Request, res: Response): Promise<void> {
  const user = req.authUser!;
  res.json({ user: { id: user.id, email: user.email, createdAt: user.created_at } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length <= 100) {
    await pool.query("DELETE FROM monarch_sessions WHERE token_hash = $1", [digestToken(token)]);
  }
  clearSessionCookie(res);
  res.status(204).end();
}
