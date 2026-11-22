# PortTracker backend

The local API runs on `127.0.0.1:3001` using Node.js 24+, Fastify and PostgreSQL 16+. The React frontend stays on port 5187. `npm ci` installs the locked dependency tree.

## Development setup

1. Create the `PortTracker` database.
2. Set `ADMIN_DATABASE_URL` in your shell and run `npm run db:provision` once. This creates separate `porttracker_app` and `porttracker_migrator` roles and schema `porttracker`. It writes random credentials to private, ignored `server/.env` and `server/.env.migrations` files. The API does not use the PostgreSQL superuser.
3. Run `npm run db:migrate`. Migrations are ordered SQL files with stored checksums and an advisory lock; changed applied migrations are rejected.
4. Run `npm run server` (or `npm run server:dev`). `/api/health` checks the process; `/api/ready` checks database connectivity and applied migration metadata.

Use `server/.env.example` when configuring an existing deployment manually. Credentials, uploaded assets and the root `porttracker-project.json` migration source are ignored by Git. Back up database and asset storage together. This development setup binds to localhost.

Implementation checkpoints are committed separately: foundation, schema, asset storage, migration/API, then frontend and authentication.
