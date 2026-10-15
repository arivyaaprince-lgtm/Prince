# Monarch — Authentication Starter

A small email/password authentication API starter for Monarch.

## Stack
- Node.js + TypeScript + Express
- PostgreSQL
- Argon2id password hashing
- Opaque random session tokens in HttpOnly, SameSite=Lax cookies; only SHA-256 token hashes are stored in PostgreSQL
- Helmet security headers and rate limits on authentication routes

## Endpoints
- POST /auth/signup — create an account
- POST /auth/login — verify credentials and create a session
- GET /auth/me — read the current authenticated user
- POST /auth/logout — revoke the current session

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Create a database and set DATABASE_URL.
3. Copy .env.example to .env and set SESSION_TOKEN_PEPPER to 32+ random bytes.
4. Run npm install, then npm run dev.

In production, use HTTPS, a secrets manager, PostgreSQL TLS, and a correctly configured reverse proxy. NODE_ENV=production enables Secure cookies.

See docs/AUTHENTICATION.md for components and credential/token handling.

## Important limitations
This is a starter, not a complete production identity platform. Email verification, password reset, MFA, OAuth, session/device management, migrations, monitoring, and automated security tests are not implemented yet. Do not launch publicly until these requirements are reviewed and tested. Never commit real secrets.


## Monarch browser app

A standalone, mobile-friendly Monarch app workspace is available in [app/](app/index.html). It includes local starter templates, an HTML editor, sandboxed live preview, browser-local save/restore, HTML/JSON export, and an AI chat UI backed by the Express endpoint `POST /api/chat`. It is separate from Princess AI and does not use Floot.

- [Open the app source](app/index.html)
- [Deployment and feature notes](MONARCH-WEB-APP.md)
- [GitHub Pages deployment workflow](.github/workflows/deploy-pages.yml)
- [Check deployment runs](https://github.com/arivyaaprince-lgtm/Prince/actions)

**Deployment note:** GitHub Pages hosts only the frontend. The AI chat needs a separately deployed Node.js backend, a configured provider key in backend secrets, a model setting, and an allowed origin. Configure these using `.env.example` and see [MONARCH-WEB-APP.md](MONARCH-WEB-APP.md). Do not commit real keys. The public site is available only after Pages is enabled and its workflow succeeds; backend deployment and provider credentials have not been verified.
