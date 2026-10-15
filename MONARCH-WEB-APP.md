# Monarch Web App

Standalone mobile-friendly browser app workshop in the app/ folder. Separate from Princess AI; no Floot dependency.

Features: local prompt-based starter templates, HTML editing, sandboxed live preview, browser-local save/restore, HTML download, project JSON export, and installable/offline-capable PWA shell.

Limitations: this version uses local templates, not a connected AI model. Cloud sync, user accounts, and an AI backend are not deployed. Existing Express/PostgreSQL authentication starter is preserved separately and is not exposed by the static frontend.

Deployment: GitHub Actions deploys app/ to GitHub Pages after changes to main. If needed, set repository Settings > Pages > Build and deployment > Source to GitHub Actions. Expected URL: https://arivyaaprince-lgtm.github.io/Prince/ . It is live only after a successful Pages deployment.
