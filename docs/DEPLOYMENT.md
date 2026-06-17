# Common Thread – Integrated Deployment Guide
This guide covers deploying both the backend Worker (core system) and the web frontend Worker (browser-based UI).
The project uses a split structure:
- Backend logic lives in `implementation/`
- Web frontend lives in the `web/` subdirectory
- Each has its own `wrangler.toml` configuration
## Prerequisites
- Node.js ≥ 18
- Cloudflare account with Workers, D1, and R2 enabled
- Wrangler CLI installed and logged in:
  ```bash
  npm install -g wrangler
  wrangler login

    Clone the repository and install dependencies:
    bash

    git clone https://github.com/skyphusion-labs/common-thread
    cd common-thread
    npm install

1. Initial Configuration

The repository provides example configuration files so you never commit real resource IDs.
bash

# Backend configuration
cp wrangler.toml.example wrangler.toml
# Web frontend configuration
cp web/wrangler.toml.example web/wrangler.toml

    Note: wrangler.toml and web/wrangler.toml are listed in .gitignore and should never be committed.

2. Create Cloudflare Resources

Run the creation commands. These commands use --binding and --update-config so the binding names (DB and ARCHIVE) stay exactly as the code expects.
Development Resources
bash

npm run db:create
npm run r2:create
npm run db:migrate:local

Production Resources
bash

npm run db:create:prod
npm run r2:create:prod
npm run db:migrate:prod

After running these commands, open wrangler.toml and web/wrangler.toml and verify that the database_id and bucket_name fields were filled in correctly under the proper binding = "DB" and binding = "ARCHIVE" entries.
3. Backend Worker

The backend is configured in the root wrangler.toml.

Deploy Backend (Development)
bash

npm run deploy:backend:dev

Deploy Backend (Production)
bash

npm run deploy:backend:prod

4. Web Frontend Worker

The web frontend is a self-contained single-file worker located in the web/ directory.

Deploy Web Frontend (Development)
bash

npm run deploy:web:dev

Deploy Web Frontend (Production)
bash

npm run deploy:web:prod

One-Command Deployment

You can deploy both the backend and web frontend together:
bash

# Development
npm run deploy:all:dev
# Production
npm run deploy:all:prod

5. Service Binding (Recommended)

The web frontend can communicate with the backend using a service binding. This is the preferred method in production because it avoids CORS issues and keeps traffic private.
How to Configure

    Deploy the backend first (so the worker name is known).

    In web/wrangler.toml, update the service binding:
    toml

    services = [
      { binding = "BACKEND", service = "common-thread" }           # development
      # { binding = "BACKEND", service = "common-thread-prod" }    # production
    ]

    Redeploy the web worker:
    bash

    npm run deploy:web:dev
    # or
    npm run deploy:web:prod

You can also configure the binding through the Cloudflare dashboard:

    Go to your web worker → Settings → Service Bindings → Add binding
    Variable name: BACKEND
    Service: select your backend worker

6. Local Development
bash

# Terminal 1 – Backend
npm run dev
# Terminal 2 – Web Frontend
npm run dev:web

The web frontend will use the DEFAULT_BACKEND_URL in web/wrangler.toml unless a service binding is available.
7. Environment Overview
Environment	Command	Backend Worker Name	Web Worker Name
Default / Local	npm run dev	common-thread	common-thread-web
Explicit Dev	npm run deploy:backend:dev	common-thread-dev	common-thread-web-dev
Production	npm run deploy:backend:prod	common-thread-prod	common-thread-web-prod
8. Post-Deployment Checklist

    Backend responds at its URL (GET / returns status information)
    Web frontend loads and shows the UI
    In the web UI, the “Backend Target” field points to your backend (or the service binding is configured)
    Test uploading sample data and running extractors in the web UI

    Set required secrets on the backend (especially for production):
    bash

    wrangler secret put AI_GATEWAY_URL --env production
    wrangler secret put ANTHROPIC_API_KEY --env production

    Verify that wrangler.toml and web/wrangler.toml are still in .gitignore

9. Updating the Web Frontend

Because the web frontend is a single self-contained file (web/worker.js), updates are simple:

    Replace web/worker.js with the new version.

    Redeploy:
    bash

    npm run deploy:web:dev
    # or
    npm run deploy:web:prod

10. Troubleshooting

Bindings are wrong (e.g. common_thread_prod instead of DB)

    Re-run the create commands. They should now respect --binding DB and --binding ARCHIVE.

Service binding not working

    Make sure the backend was deployed before the web frontend.
    The service name in web/wrangler.toml must exactly match the deployed backend worker name.
    Redeploy the web worker after changing the binding.

Secrets not set

    The web UI runs most analysis client-side. The backend still needs AI_GATEWAY_URL and ANTHROPIC_API_KEY for the reasoning features.

Local development with bindings

    Service bindings work best when at least one of the workers is running with --remote, or when using the public DEFAULT_BACKEND_URL fallback during local development.

Useful Commands Reference
bash

# Backend
npm run deploy:backend:dev
npm run deploy:backend:prod
# Web Frontend
npm run deploy:web:dev
npm run deploy:web:prod
npm run dev:web
# Combined
npm run deploy:all:dev
npm run deploy:all:prod
# Resources
npm run db:create
npm run r2:create
npm run db:create:prod
npm run r2:create:prod

Need help?

Open an issue on GitHub or refer to the methodology paper for architectural context.