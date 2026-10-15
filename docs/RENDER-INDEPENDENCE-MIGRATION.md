# Monarch: migrate away from Render safely

Goal: make the application portable and move hosting/database before the Render PostgreSQL expiry. Do not delete the current Render service or database until the replacement is live and verified.

## What this change does
- Adds a Dockerfile so the same Node/Express app can run on a Docker-capable host.
- Keeps app source, authentication, chat routes, and database schema intact.
- Does **not** migrate production data or create a replacement host/database by itself.

## Required replacement components
1. A Docker-capable host or a self-managed Linux server with persistent availability.
2. A managed PostgreSQL database or a backed-up, persistent PostgreSQL instance.
3. Secret storage for `DATABASE_URL`, `SESSION_TOKEN_PEPPER`, and `AI_API_KEY`.
4. HTTPS and a domain/reverse proxy for production cookies.

## Container configuration
Build: `docker build -t monarch:latest .`

Run (supply secrets through the host's secret manager, not a committed file):
```sh
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e SESSION_TOKEN_PEPPER="$SESSION_TOKEN_PEPPER" \
  -e AI_API_KEY="$AI_API_KEY" \
  -e AI_BASE_URL="${AI_BASE_URL:-https://openrouter.ai/api/v1}" \
  -e AI_MODEL="${AI_MODEL:-openrouter/free}" \
  monarch:latest
```
The database must be reachable from the host/container and accept TLS according to that database provider's documented settings. Never paste secrets into GitHub issues or chat.

## Data migration checklist
- [ ] Create the replacement PostgreSQL database and save its credentials in the host's secret manager.
- [ ] Export the current Render database using a trusted PostgreSQL client while it is still available.
- [ ] Import the dump into the replacement database.
- [ ] Compare row counts for `monarch_users`, `monarch_sessions`, and `monarch_chat_messages`; run auth and chat smoke tests.
- [ ] Configure the new host's environment and deploy the container.
- [ ] Verify `/health`, signup/login/logout, authenticated chat, and chat-history restore over HTTPS.
- [ ] Point the domain/frontend at the new host and verify cookies and CORS.
- [ ] Keep Render running as rollback until the replacement is confirmed and a fresh backup exists.
- [ ] Only then remove Render resources.

## Important limitations
This is a portability step, not a completed migration. No database has been copied, no replacement host has been provisioned, and no secrets have been moved by this commit. A persistent host and a separate database are still required. A free-tier host may sleep, impose quotas, or remove resources; confirm its current terms before relying on it.
