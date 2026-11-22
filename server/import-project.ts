import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { configFromEnv } from './config';
import { createPool } from './db';
import { AssetStore } from './assets';
import { ProjectRepository, backupCounts, withoutServerIds } from './repository';
import { createProjectBackup, MAX_PROJECT_BACKUP_BYTES, parseProjectBackup } from '../src/projectBackup';
const file=process.argv[2];if(!file)throw new Error('Usage: npm run db:import -- path/to/project.json');
const bytes=await readFile(file);if(bytes.length>MAX_PROJECT_BACKUP_BYTES)throw new Error('Backup exceeds 128 MB.');
const sourceHash=createHash('sha256').update(bytes).digest('hex');
const parsed=parseProjectBackup(JSON.parse(bytes.toString('utf8'))),backup=createProjectBackup(parsed.project,parsed.facilityPlan);
const config=configFromEnv(),db=createPool(config.databaseUrl),repository=new ProjectRepository(db,new AssetStore(config.assetRoot));
try {
  const previous=await db.query("SELECT p.id,p.revision FROM projects p JOIN project_events e ON e.project_id=p.id WHERE e.action='import' AND e.summary->>'sourceHash'=$1",[sourceHash]);
  if(previous.rows.length){console.log(JSON.stringify({status:'already imported',...previous.rows[0]}));}
  else {
    const saved=await repository.save(backup,{actor:'migration-cli',sourceHash});
    const restored=await repository.load(saved.id);
    assert.deepEqual(JSON.parse(JSON.stringify(withoutServerIds(restored.backup))),JSON.parse(JSON.stringify(withoutServerIds(backup))));
    const report={status:'verified',sourceHash,projectId:saved.id,revision:saved.revision,counts:backupCounts(restored.backup),verifiedAt:new Date().toISOString()};
    await mkdir('server/data',{recursive:true,mode:0o700});await writeFile('server/data/migration-report.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify(report,null,2));
  }
} finally {await db.end();}
