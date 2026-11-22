import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerStore } from '../src/serverStorage';
import { createProjectBackup } from '../src/projectBackup';
import { locationPortsFixture } from './location-ports-fixture';
test('server autosaves serialize rack/map updates and advance revisions without losing edits',async t=>{
  const {project,plan}=locationPortsFixture(),store=new ServerStore({id:'server-id',revision:1,backup:createProjectBackup(project,plan)},{id:'user',username:'editor',role:'editor'});
  let release:()=>void=()=>{},active=0,max=0;const gate=new Promise<void>(resolve=>{release=resolve;});const writes:{revision:string;body:ReturnType<typeof store.snapshot>}[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{
    active++;max=Math.max(max,active);writes.push({revision:(options.headers as Record<string,string>)['If-Match'],body:JSON.parse(String(options.body))});
    if(writes.length===1)await gate;active--;return new Response(JSON.stringify({revision:writes.length+1}),{headers:{'content-type':'application/json'}});
  });
  store.updateProject({...project,siteName:'First edit'});const a=store.flush();
  store.updateFloor({...plan,floor:'Second edit'});const b=store.flush();release();await Promise.all([a,b]);
  assert.equal(max,1);assert.equal(writes.length,2);assert.equal(writes[1].revision,'"2"');assert.equal(writes[1].body.siteName,'First edit');assert.equal(writes[1].body.facilityPlan!.floor,'Second edit');assert.equal(store.revision,3);assert.equal(store.dirty,false);store.dispose();
});
test('SMB links follow physical port IDs when the rack port number changes',async()=>{
  const {withServerIdentities}=await import('../src/serverStorage');
  const {setEquipmentPortStart}=await import('../src/model');
  const fixture=locationPortsFixture(),project=withServerIdentities(fixture.project);
  const store=new ServerStore({id:'server-id',revision:1,backup:createProjectBackup(project,fixture.plan)},{id:'user',username:'editor',role:'editor'});
  const next=structuredClone(project);next.locations[0].layout=setEquipmentPortStart(next.locations[0].layout,'R1','P1',100);store.updateProject(next);
  assert.equal(store.floor!.objects.find(o=>o.name==='SMB A')!.ports![0].patchPanelPort,100);
  assert.equal(store.floor!.objects.find(o=>o.name==='SMB B')!.ports![0].patchPanelPort,101);store.dispose();
});
