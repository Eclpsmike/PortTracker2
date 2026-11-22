import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv } from '../config';
import { createPool } from '../db';
import { AssetStore } from '../assets';
test('assets round-trip, deduplicate within projects, and validate file bytes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'porttracker-assets-')),store=new AssetStore(root),db=createPool(configFromEnv().databaseUrl),c=await db.connect();
  try {
    await c.query('BEGIN');const project=randomUUID();
    await c.query("INSERT INTO projects(id,legacy_id,name,configuration) VALUES($1,$2,'Assets','{}')",[project,project]);
    const src=`data:image/png;base64,${(await readFile('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png')).toString('base64')}`;
    const original={front:src,rear:src,note:'A normal note'},stored=await store.externalize(original,project,c);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM assets WHERE project_id=$1',[project])).rows[0].n,1);
    assert.deepEqual(await store.hydrate(stored,project,c),original);
    await assert.rejects(()=>store.put(c,project,'data:image/png;base64,aW52YWxpZA=='));
    assert.throws(()=>store.path('../outside','bad'));
    await assert.rejects(()=>store.hydrate(stored,randomUUID(),c),/missing/);
  } finally {await c.query('ROLLBACK');c.release();await db.end();await rm(root,{recursive:true,force:true});}
});
