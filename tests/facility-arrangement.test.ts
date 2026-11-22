import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeObjects, arrangementAxis } from '../src/facility/arrangement';
import { createObject, samplePlan, syncRouteConnections } from '../src/facility/model';

function fixture(){
  const plan=samplePlan();plan.objects=[];
  for(const point of [{x:100,y:150},{x:180,y:230},{x:300,y:170}])plan.objects.push(createObject(plan,'speaker',point,'devices'));
  return plan;
}
test('alignment uses symbol centers and preserves labels, sizes, identity and group center',()=>{
  const plan=fixture();plan.objects[1].labelStyle={fontSize:48,offsetX:100};plan.objects[1].symbolWidth=50;
  const before=structuredClone(plan);
  const updates=arrangeObjects(plan,plan.objects,'align-horizontal','horizontal');
  assert.deepEqual(updates.map(o=>[o.x,o.y]),[[100,190],[300,190],[180,190]]);
  for(const object of updates){const original=plan.objects.find(o=>o.id===object.id)!;assert.deepEqual({...object,y:original.y},original);}
  assert.deepEqual(plan,before);
  const vertical=arrangeObjects(plan,plan.objects,'align-vertical','vertical');
  assert.ok(vertical.every(o=>o.x===200));
});
test('spacing and distribution preserve order and extent center with calibrated grid increments',()=>{
  const plan=fixture();
  const changed=arrangeObjects(plan,plan.objects,'increase','horizontal');
  assert.deepEqual(changed.map(o=>o.x),[90,310]);
  plan.objects=plan.objects.map(o=>changed.find(update=>update.id===o.id)??o);
  const tightened=arrangeObjects(plan,plan.objects,'decrease','horizontal');
  assert.deepEqual(tightened.map(o=>o.x),[100,300]);
  assert.equal(arrangeObjects(plan,plan.objects,'distribute','horizontal')[0].x,200);
  plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:10,unit:'ft'};plan.grid={spacing:2,unit:'ft'};
  assert.deepEqual(arrangeObjects(plan,plan.objects,'increase','horizontal').map(o=>o.x),[70,330]);
  assert.equal(arrangementAxis([{...plan.objects[0],x:100,y:100},{...plan.objects[1],x:100,y:300}]),'vertical');
});
test('locked items and paths are excluded, while attached paths can follow arranged items',()=>{
  const plan=fixture();plan.objects[1].layerId='cameras';plan.layers.find(l=>l.id==='cameras')!.locked=true;
  const a=plan.objects[0],b=plan.objects[2];
  const route={...createObject(plan,'cable',{x:a.x,y:a.y},'paths'),points:[{x:a.x+14,y:a.y},{x:200,y:250},{x:b.x-14,y:b.y}],sourceId:a.id,sourceSide:'right' as const,destinationId:b.id,destinationSide:'left' as const};
  plan.objects.push(route);
  const updates=arrangeObjects(plan,plan.objects,'align-horizontal','horizontal');
  assert.equal(updates.length,2);assert.ok(updates.every(o=>o.y===160));
  const next=syncRouteConnections({...plan,objects:plan.objects.map(o=>updates.find(update=>update.id===o.id)??o)});
  assert.deepEqual(next.objects[3].points,[{x:114,y:160},{x:200,y:250},{x:286,y:160}]);
  assert.equal(next.objects[1],plan.objects[1]);
});
test('spacing stops at the drawing boundary and minimum grid interval; distribution needs three items',()=>{
  const plan=fixture();plan.objects=plan.objects.map((o,i)=>({...o,x:i*10,y:100}));
  assert.deepEqual(arrangeObjects(plan,plan.objects,'increase','horizontal'),[]);
  assert.deepEqual(arrangeObjects(plan,plan.objects,'decrease','horizontal'),[]);
  assert.deepEqual(arrangeObjects(plan,plan.objects.slice(0,2),'distribute','horizontal'),[]);
});
