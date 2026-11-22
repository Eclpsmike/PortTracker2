import test from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv } from '../config';
import { createPool, transaction } from '../db';
import { buildServer } from '../app';
test('API health and readiness use the restricted application role', async () => {
  const config=configFromEnv(), db=createPool(config.databaseUrl), app=buildServer(config,db);
  try {
    assert.equal((await app.inject('/api/health')).statusCode,200);
    assert.equal((await app.inject('/api/ready')).statusCode,200);
    const roles=await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user');
    assert.deepEqual(roles.rows[0],{rolsuper:false,rolcreatedb:false,rolcreaterole:false});
    await assert.rejects(()=>transaction(db,async c=>{await c.query('CREATE TABLE forbidden(id int)');}),/permission denied/);
  } finally { await app.close(); await db.end(); }
});
test('configuration rejects missing or invalid database and port values',()=>{
  assert.throws(()=>configFromEnv({}),/DATABASE_URL/);
  assert.throws(()=>configFromEnv({DATABASE_URL:'https://example.com'}),/PostgreSQL/);
  assert.throws(()=>configFromEnv({DATABASE_URL:'postgres://localhost/test',API_PORT:'bad'}),/API_PORT/);
});
