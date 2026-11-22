import { configFromEnv } from './config';
import { createPool } from './db';
import { buildServer } from './app';
const config = configFromEnv(), db = createPool(config.databaseUrl), app = buildServer(config, db);
async function close() { await app.close(); await db.end(); }
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
try { await app.listen({ host: config.host, port: config.port }); }
catch (error) { console.error('Backend startup failed:', error instanceof Error ? error.name : 'Error'); await close(); process.exitCode = 1; }
