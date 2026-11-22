import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../db';
import { configFromEnv } from '../config';
import { stableId } from '../identity';
test('template revisions are immutable and geometry is constrained',async()=>{
  const db=createPool(configFromEnv().databaseUrl), c=await db.connect();
  try {
    await c.query('BEGIN');const project=randomUUID(), template=randomUUID(), revision=randomUUID();
    await c.query("INSERT INTO projects(id,legacy_id,name,configuration) VALUES($1,$2,'Test','{}')",[project,project]);
    await c.query("INSERT INTO equipment_templates(id,project_id,legacy_id,name) VALUES($1,$2,'test','Test')",[template,project]);
    await c.query("INSERT INTO template_revisions(id,project_id,template_id,revision,digest,definition) VALUES($1,$2,$3,1,'test','{}')",[revision,project,template]);
    await c.query('SAVEPOINT check_revision');
    await assert.rejects(()=>c.query("UPDATE template_revisions SET definition='{}' WHERE id=$1",[revision]),/immutable/);
    await c.query('ROLLBACK TO SAVEPOINT check_revision');
    await c.query('SAVEPOINT check_geometry');
    await assert.rejects(()=>c.query("INSERT INTO template_revision_ports(id,revision_id,port_identity,slot,name,face,x,y,width,height,data) VALUES($1,$2,$3,0,'bad','rear',2,.5,.1,.1,'{}')",[randomUUID(),revision,randomUUID()]),/check constraint/);
    await c.query('ROLLBACK TO SAVEPOINT check_geometry');
    const constraints=await c.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='cable_endpoints'::regclass");
    assert.ok(constraints.rows.some(r=>r.definition==='UNIQUE (project_id, port_id)'));
    assert.equal(stableId(project,'port','1'),stableId(project,'port','1'));
    assert.notEqual(stableId(project,'port','1'),stableId(project,'port','2'));
  } finally {await c.query('ROLLBACK');c.release();await db.end();}
});
