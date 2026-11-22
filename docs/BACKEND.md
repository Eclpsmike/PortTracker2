# PortTracker backend

The local API runs on `127.0.0.1:3001` using Node.js 24+, Fastify and PostgreSQL 16+. The React frontend stays on port 5187. `npm ci` installs the locked dependency tree.

## Development setup

1. Create the `PortTracker` database.
2. Set `ADMIN_DATABASE_URL` in your shell and run `npm run db:provision` once. This creates separate `porttracker_app` and `porttracker_migrator` roles and schema `porttracker`. It writes random credentials to private, ignored `server/.env` and `server/.env.migrations` files. The API does not use the PostgreSQL superuser.
3. Run `npm run db:migrate`. Migrations are ordered SQL files with stored checksums and an advisory lock; changed applied migrations are rejected.
4. Run `npm run server` (or `npm run server:dev`). `/api/health` checks the process; `/api/ready` checks database connectivity and applied migration metadata.

Use `server/.env.example` when configuring an existing deployment manually. Credentials, uploaded assets and the root `porttracker-project.json` migration source are ignored by Git. Back up database and asset storage together. This development setup binds to localhost.

Implementation checkpoints are committed separately: foundation, schema, asset storage, migration/API, then frontend and authentication.

## Database model

Migration 002 stores projects/configuration, buildings, frames, racks, equipment, physical device ports, cable endpoints, templates/revisions/geometry, floor/layers/map objects/SMB ports, and change events in related tables. Extensible presentation fields remain JSONB on their owning record. Uploaded binary files are handled separately. Foreign keys include project ownership; a physical port can occur in only one cable endpoint. Published template revisions reject updates. Coordinates are normalized and bounded.

Legacy display IDs remain available for backup compatibility. Server UUIDs identify records. Device identity metadata travels with the frontend model so rack moves and port-range changes preserve physical endpoint UUIDs. Database migrations run with a separate owner role; the API has data permissions only.

## Asset storage

Migration 003 records project-owned assets. `AssetStore` validates/decode-checks raster images, checks PDF/SVG signatures for original files, hashes content, and writes immutable files atomically under `ASSET_ROOT/<project UUID>/<SHA-256>`. Images are decoded with a pixel limit; files are capped at 40 MB. Repeated images in one project share a file. Files and source YAML are never fetched from arbitrary URLs. Original SVG files are retained for download only, not served as executable pages.

Database records contain asset references; exports hydrate them into embedded data URLs and verify hashes. Assets are created before the project transaction commits. A failed transaction can leave an unreferenced content-addressed file, but never a committed reference to an unwritten file. Retain those files until an explicit garbage-collection policy is implemented; never delete files merely because the current revision no longer uses them. Back up the database and asset directory as one logical unit.
