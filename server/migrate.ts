import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool, transaction, type Database } from './db';
export async function migrate(db: Database) {
  return transaction(db, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('porttracker-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of (await readdir(new URL('./migrations/', import.meta.url))).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const sql = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'), checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [file]);
      if (existing.rows.length) { if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${file}`); continue; }
      await client.query(sql); await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [file, checksum]);
      console.log(`Applied ${file}`);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required.');
  const db = createPool(process.env.MIGRATION_DATABASE_URL);
  try { await migrate(db); } finally { await db.end(); }
}
