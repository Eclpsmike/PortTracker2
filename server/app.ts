import { registerAuth } from './auth';
import { registerProjectRoutes } from './routes';
import { ProjectRepository } from './repository';
import { AssetStore } from './assets';
import Fastify from 'fastify';
import type { ServerConfig } from './config';
import type { Database } from './db';
export function buildServer(config: ServerConfig, db: Database) {
  const app = Fastify({ bodyLimit: 128 * 1024 * 1024, logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] } });
  registerAuth(app,db,config);
  registerProjectRoutes(app,new ProjectRepository(db,new AssetStore(config.assetRoot)));
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/ready', async (_request, reply) => {
    try { await db.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ error: 'Database unavailable or migrations not applied.' }); }
  });
  app.addHook('onSend', async (_request, reply) => { reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, request, reply) => {
    const code = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (code >= 500) request.log.error({ name: error instanceof Error ? error.name : 'Error' }, 'Request failed');
    reply.code(code >= 400 && code < 600 ? code : 500).send({ error: code < 500 && error instanceof Error ? error.message : 'The server could not complete the request.' });
  });
  return app;
}
