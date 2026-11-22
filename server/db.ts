import pg, { type PoolClient } from 'pg';
export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 30000, options: '-c search_path=porttracker,public' });
  pool.on('error', error => console.error('Idle database connection failed:', error.name));
  return pool;
}
export type Database = ReturnType<typeof createPool>;
export async function transaction<T>(db: Database, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
