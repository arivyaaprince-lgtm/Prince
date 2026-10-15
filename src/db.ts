import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be configured");

export const pool = new Pool({
  connectionString,
  // Render's managed Postgres may present a self-signed certificate.
  // Keep TLS encryption enabled while allowing that certificate.
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monarch_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS monarch_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES monarch_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS monarch_sessions_user_id_idx ON monarch_sessions(user_id);
    CREATE INDEX IF NOT EXISTS monarch_sessions_expires_at_idx ON monarch_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS monarch_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES monarch_users(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL,
      message_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL CHECK (char_length(content) <= 16000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, conversation_id, message_id, role)
    );
    CREATE INDEX IF NOT EXISTS monarch_chat_messages_history_idx
      ON monarch_chat_messages(user_id, conversation_id, id DESC);
  `);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
