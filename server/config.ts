import { resolve } from 'node:path';
export interface ServerConfig { databaseUrl: string; host: string; port: number; assetRoot: string; origins: string[]; secureCookies: boolean }
export function configFromEnv(env = process.env): ServerConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required. See server/.env.example.');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid port.');
  return { databaseUrl: env.DATABASE_URL, host: env.API_HOST ?? '127.0.0.1', port,
    assetRoot: resolve(env.ASSET_ROOT ?? 'server/data/assets'),
    origins: (env.APP_ORIGINS ?? 'http://127.0.0.1:5187,http://localhost:5187').split(',').map(s => s.trim()), secureCookies: env.COOKIE_SECURE === 'true' };
}
