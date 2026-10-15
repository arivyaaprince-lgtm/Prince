# Monarch Web App

Monarch is a standalone mobile-friendly app workspace in `app/`, separate from Princess AI and not dependent on Floot.

## Current features
- Local starter templates, HTML editing, sandboxed live preview, browser-local save/restore, HTML download, project JSON export.
- A Monarch AI chat UI connected to the backend endpoint `POST /api/chat`.
- The backend calls an OpenAI-compatible chat-completions provider; default example provider is OpenRouter.
- Input validation, bounded conversation size, a 45-second upstream timeout, sanitized provider errors, and per-IP rate limiting.
- The provider API key is read only from backend environment variables and must never be committed or sent to the browser.

## Configure AI
Set these variables on the backend host (not in the static frontend):
- `AI_API_KEY`: provider key from your chosen AI provider.
- `AI_BASE_URL`: API root, e.g. `https://openrouter.ai/api/v1`.
- `AI_MODEL`: model identifier supported by that provider, e.g. a free model available to your account.
- `AI_SITE_URL`: optional site URL for provider attribution.
- `APP_ORIGINS`: comma-separated allowed browser origins, including `https://arivyaaprince-lgtm.github.io`.

The frontend asks for the deployed backend base URL in the Monarch AI panel and stores it locally in that browser. It sends messages to `/api/chat`; no provider key belongs in that field.

## Backend requirements and limits
The current Express server also initializes PostgreSQL and validates `SESSION_TOKEN_PEPPER` at startup because the repository contains the authentication starter. To run the server, configure `DATABASE_URL`, `SESSION_TOKEN_PEPPER`, and the AI variables. Configure HTTPS and a persistent database on your hosting provider. The AI endpoint is rate-limited, but before public launch add account-based quotas/usage billing controls and monitor provider spend. A free model/provider can have limited capacity, change availability, or impose its own limits.

## Deployment
GitHub Pages can host only the static frontend; it cannot run the Express backend or keep provider secrets. The static site workflow is in `.github/workflows/deploy-pages.yml`. The frontend URL is `https://arivyaaprince-lgtm.github.io/Prince/` after Pages is enabled and a workflow succeeds. Deploy the Express API separately to a Node-capable host and configure its environment variables there. Neither live deployment nor working provider credentials are implied by committing this code.
