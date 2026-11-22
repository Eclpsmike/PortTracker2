// One-time local provisioning. ADMIN_DATABASE_URL is used only by this command.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
if (!process.env.ADMIN_DATABASE_URL) throw new Error('Set ADMIN_DATABASE_URL for one-time provisioning.');
for (const path of ['server/.env', 'server/.env.migrations']) {
  try { await access(path); throw new Error(`${path} already exists; provisioning will not overwrite it.`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
await admin.connect();
try {
  const db = (await admin.query('SELECT current_database() AS name')).rows[0].name;
  if (db !== 'PortTracker') throw new Error('Provisioning expects the PortTracker development database.');
  const appPassword = randomBytes(32).toString('hex'), migrationPassword = randomBytes(32).toString('hex');
  await admin.query('BEGIN');
  await admin.query(`CREATE ROLE porttracker_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${migrationPassword}'`);
  await admin.query(`CREATE ROLE porttracker_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${appPassword}'`);
  await admin.query('CREATE SCHEMA porttracker AUTHORIZATION porttracker_migrator');
  await admin.query('GRANT CONNECT ON DATABASE "PortTracker" TO porttracker_app, porttracker_migrator');
  await admin.query('GRANT USAGE ON SCHEMA porttracker TO porttracker_app');
  await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE porttracker_migrator IN SCHEMA porttracker GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO porttracker_app');
  await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE porttracker_migrator IN SCHEMA porttracker GRANT USAGE, SELECT ON SEQUENCES TO porttracker_app');
  await admin.query('COMMIT');
  const appUrl = new URL(process.env.ADMIN_DATABASE_URL), migrationUrl = new URL(appUrl);
  appUrl.username = 'porttracker_app'; appUrl.password = appPassword;
  migrationUrl.username = 'porttracker_migrator'; migrationUrl.password = migrationPassword;
  await writeFile('server/.env', `DATABASE_URL=${appUrl}\nAPI_HOST=127.0.0.1\nAPI_PORT=3001\n`, { mode: 0o600, flag: 'wx' });
  await writeFile('server/.env.migrations', `MIGRATION_DATABASE_URL=${migrationUrl}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created application/migration roles and private environment files.');
} catch (error) { await admin.query('ROLLBACK'); throw error; }
finally { await admin.end(); }
