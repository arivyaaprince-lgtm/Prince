# Monarch Authentication: Components and Request Flow

## Status
This repository implements an initial email/password API starter, not a complete production-ready identity service.

## Components
- src/server.ts — HTTP setup, security headers, request parsing, rate limits, cookie policy, Origin checks, and endpoint wiring.
- src/db.ts — PostgreSQL pool and schema initialization for users and sessions.
- src/auth.ts — signup/login/logout/current-user handlers, Argon2id password hashing, opaque session issuance, and authentication middleware.
- package.json — runtime dependencies and developer commands.
- .env.example — configuration variable names and placeholders only.

## Signup flow
Browser -> POST /auth/signup -> validate body -> Argon2id hash -> insert user -> create session -> Set-Cookie.

Email is normalized to lowercase. Passwords are hashed; the original password is never written to the database.

## Login flow
Browser -> POST /auth/login -> validate body -> find user by normalized email -> verify Argon2id hash -> create session -> Set-Cookie.

Unknown email and wrong password return the same generic error. Rate limits slow repeated attempts; production should monitor abuse and tune limits.

## Authenticated request
Browser sends HttpOnly cookie -> hash token -> query unexpired session -> load user -> handler.

The raw session token is never stored in PostgreSQL. A SHA-256 digest is stored instead. Sessions have a fixed expiry; this starter does not rotate sessions or implement refresh tokens.

## Logout flow
Browser -> POST /auth/logout -> hash cookie token -> delete session -> clear cookie.

Deleting the server-side session revokes it immediately, even if a copied cookie has not expired.

## Credential and token handling
- Passwords: Argon2id hashes; plaintext passwords are not stored.
- Session token: cryptographically random opaque value delivered in an HttpOnly cookie.
- Database: stores only the SHA-256 token hash, user ID, and expiry.
- Cookie: HttpOnly, SameSite=Lax, path /, fixed expiry; Secure is enabled in production.
- DATABASE_URL and SESSION_TOKEN_PEPPER must come from a deployment secret manager and must never be committed.

## Security boundaries and remaining work
- Use HTTPS for all production traffic.
- Configure exact browser origins in APP_ORIGINS; never use wildcard credentialed CORS.
- State-changing requests check Origin when present. Cross-site deployments need a fully tested CSRF strategy.
- Configure PostgreSQL TLS, least-privilege database access, backups, and migrations for production.
- Add email verification, single-use password-reset tokens, MFA, OAuth if needed, audit events, session revocation UI, dependency scanning, integration tests, and security review before public launch.
- Reverse-proxy trust settings are deployment-specific; do not blindly enable Express trust proxy.
- Never log passwords, cookies, raw tokens, database URLs, or secret environment values.

## Commands
- npm run dev — local development
- npm run typecheck — TypeScript validation
- npm run build — compile to dist/

The code has not been run automatically in a real Node/PostgreSQL environment; validate before deployment.
