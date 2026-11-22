import { followPortReference, mappedPortId, samePortReference } from '../src/facility/portIdentityLinks';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { parseDocument } from 'yaml';
import { createProjectBackup, parseProjectBackup, type ProjectBackup } from '../src/projectBackup';
import { endpointKey, portNumbers, type Layout } from '../src/model';
import type { EquipmentTemplate } from '../src/equipmentTemplates';
import type { Project, Closet } from '../src/project';
import type { FloorPlan, FloorObject } from '../src/facility/model';
import { rackPortIndex, resolveFloorPort } from '../src/facility/portLocations';
import { AssetStore } from './assets';
import { stableId, isUuid } from './identity';
import { transaction, type Database } from './db';
export class HttpError extends Error { constructor(readonly statusCode:number,message:string){super(message);} }
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const omit=(value:object,keys:string[])=>Object.fromEntries(Object.entries(value).filter(([k])=>!keys.includes(k)));
const tables=['map_ports','map_objects','floor_layers','floors','cable_endpoints','cables','device_ports','equipment','racks','distribution_frames','buildings'] as const;
type Row=Record<string,unknown>;
async function insert(client:PoolClient,table:string,rows:Row[]){
  if(!rows.length)return;
  if(!/^[a-z_]+$/.test(table))throw new Error('Invalid internal table');
  const columns=Object.keys(rows[0]).map(c=>`"${c}"`).join(',');
  await client.query(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(rows)]);
}
export function backupCounts(backup:ProjectBackup){
  const racks=backup.locations.flatMap(f=>f.layout.racks),equipment=racks.flatMap(r=>r.equipment);
  return {frames:backup.locations.length,racks:racks.length,equipment:equipment.length,ports:equipment.reduce((n,e)=>n+e.portCount,0),cables:backup.locations.reduce((n,f)=>n+f.layout.cables.length,0),templates:backup.templates?.length??0,objects:backup.facilityPlan?.objects.length??0,mapPorts:backup.facilityPlan?.objects.reduce((n,o)=>n+(o.ports?.length??0),0)??0};
}
export class ProjectRepository {
  constructor(readonly db:Database,readonly assets:AssetStore){}
  async list(){return (await this.db.query('SELECT id,name,revision,updated_at FROM projects ORDER BY created_at,id')).rows;}
  async load(id:string){
    if(!isUuid(id))throw new HttpError(400,'Invalid project ID.');
    return transaction(this.db,async c=>{
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const result=await c.query('SELECT * FROM projects WHERE id=$1',[id]);if(!result.rows.length)throw new HttpError(404,'Project not found.');
      const root=result.rows[0], data=new Map<string,Row[]>();
      for(const table of [...tables].reverse())data.set(table,(await c.query(`SELECT * FROM ${table} WHERE project_id=$1`,[id])).rows);
      const ordered=(table:string)=>[...data.get(table)!].sort((a,b)=>Number(a.position)-Number(b.position));
      const buildings=ordered('buildings').map(r=>r.data);
      const portRows=data.get('device_ports')!, eqRows=ordered('equipment'), rackRows=ordered('racks');
      const eqById=new Map(eqRows.map(e=>[e.id,e])),rackById=new Map(rackRows.map(r=>[r.id,r])),portById=new Map(portRows.map(p=>[p.id,p]));
      const endpoint=(portId:unknown)=>{const p=portById.get(portId)!,e=eqById.get(p.equipment_id)!,r=rackById.get(e.rack_id)!;return {rackId:String(r.legacy_id),equipmentId:String(e.legacy_id),port:Number(p.number)};};
      const locations=ordered('distribution_frames').map(frame=>{
        const frameRacks=rackRows.filter(r=>r.frame_id===frame.id);
        const layout={...(frame.layout_data as Layout),racks:frameRacks.map(r=>({...r.data as object,equipment:eqRows.filter(e=>e.rack_id===r.id).map(e=>e.data)})),cables:ordered('cables').filter(x=>x.frame_id===frame.id).map(cable=>{
          const ends=data.get('cable_endpoints')!.filter(e=>e.cable_id===cable.id);return {...cable.data as object,...Object.fromEntries(ends.map(e=>[String(e.side),endpoint(e.port_id)]))};
        })} as unknown as Layout;
        for(const p of portRows){const e=eqById.get(p.equipment_id)!;if(!frameRacks.some(r=>r.id===e.rack_id))continue;const key=endpointKey(endpoint(p.id));
          if(p.vlan!==null)(layout.portVlans??={})[key]=Number(p.vlan);
          if(p.details!==null)(layout.portDetails??={})[key]=p.details as NonNullable<Layout['portDetails']>[string];
          if(p.media!==null)(layout.portMedia??={})[key]=p.media as NonNullable<Layout['portMedia']>[string];
        }
        return {...frame.data as object,layout} as Closet;
      });
      const catalog=await c.query('SELECT r.*,t.position FROM equipment_templates t JOIN template_revisions r ON r.id=t.current_revision_id WHERE t.project_id=$1 AND t.active ORDER BY t.position',[id]);
      const templates:EquipmentTemplate[]=[];
      for(const revision of catalog.rows){
        const ports=await c.query('SELECT data FROM template_revision_ports WHERE revision_id=$1 ORDER BY slot',[revision.id]);
        const definition=revision.definition;
        if(revision.source_yaml!==null)definition.source={...definition.source,yaml:revision.source_yaml};
        templates.push({...definition,ports:ports.rows.map(p=>p.data)});
      }
      let floor:FloorPlan|null=null;
      if(data.get('floors')!.length){const f=data.get('floors')![0];floor={...f.data as FloorPlan,layers:ordered('floor_layers').map(r=>r.data) as FloorPlan['layers'],objects:ordered('map_objects').map(o=>{
        const value={...o.data as FloorObject};const ports=ordered('map_ports').filter(p=>p.object_id===o.id).map(p=>p.data);
        if('ports' in value||ports.length)value.ports=ports as FloorObject['ports'];return value;
      })};}
      const project={...root.data,configuration:root.configuration,buildings,locations,...(root.catalog_present?{templates}:{})} as Project;
      const backup=await this.assets.hydrate({...project,kind:'porttracker-backup',backupVersion:1,facilityPlan:floor} as ProjectBackup,id,c);
      const checked=parseProjectBackup(backup);
      return {id,revision:root.revision,backup:createProjectBackup(checked.project,checked.facilityPlan)};
    });
  }
  async save(value:unknown,options:{id?:string;expectedRevision?:number;actor:string;sourceHash?:string}){
    let parsed:ReturnType<typeof parseProjectBackup>;
    try{parsed=parseProjectBackup(value);}catch(error){throw new HttpError(400,(error as Error).message);}
    const project=parsed.project,id=options.id??stableId('project',project.id),isNew=!options.id;
    if(!isUuid(id))throw new HttpError(400,'Invalid project ID.');
    return transaction(this.db,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      const found=await c.query('SELECT * FROM projects WHERE id=$1 FOR UPDATE',[id]);
      const existing=found.rows[0];
      if(isNew&&existing)throw new HttpError(409,'This project already exists. Open it or explicitly replace its current revision.');
      if(!isNew&&!existing)throw new HttpError(404,'Project not found.');
      if(existing&&existing.revision!==options.expectedRevision)throw new HttpError(409,'This project changed in another session. Export your changes, then reload the latest version.');
      if(existing&&existing.legacy_id!==project.id)throw new HttpError(400,'Project identity does not match. Import as a separate project.');
      const revision=existing?existing.revision+1:1;
      const previousEq=existing?(await c.query('SELECT e.id,e.legacy_id,f.legacy_id AS frame FROM equipment e JOIN racks r ON r.id=e.rack_id JOIN distribution_frames f ON f.id=r.frame_id WHERE e.project_id=$1',[id])).rows:[];
      const previousMap=existing?(await c.query('SELECT object_id,legacy_id,device_port_id,data FROM map_ports WHERE project_id=$1',[id])).rows:[];
      const previousPorts=existing?(await c.query('SELECT id,equipment_id,slot FROM device_ports WHERE project_id=$1',[id])).rows:[];
      const identities=new Set<string>();
      for(const frame of project.locations)for(const rack of frame.layout.racks)for(const e of rack.equipment){
        const retained=!isNew&&e.databaseId&&previousEq.some(old=>old.id===e.databaseId&&old.legacy_id===e.id&&old.frame===frame.id)?e.databaseId:!isNew&&isUuid(e.databaseId)&&!previousEq.some(old=>old.id===e.databaseId)?e.databaseId:stableId(id,'equipment',frame.id,rack.id,e.id);
        if(identities.has(retained))throw new HttpError(400,'Duplicate equipment identity.');identities.add(retained);e.databaseId=retained;
        e.databasePortIds=portNumbers(e).map((_,slot)=>{
          const old=e.databasePortIds?.[slot];const pid=!isNew&&old&&previousPorts.some(p=>p.id===old&&p.equipment_id===retained&&p.slot===slot)?old:!isNew&&isUuid(old)&&!previousPorts.some(p=>p.id===old)?old:stableId(retained,'port',String(slot));
          if(identities.has(pid))throw new HttpError(400,'Duplicate physical port identity.');identities.add(pid);return pid;
        });
      }
      if(parsed.facilityPlan&&existing){
        const floorId=stableId(id,'floor',parsed.facilityPlan.id),byPort=new Map(rackPortIndex(project).flatMap(row=>{const pid=mappedPortId(row);return pid?[[pid,row] as const]:[];}));
        for(const object of parsed.facilityPlan.objects)if(object.ports)object.ports=object.ports.map(port=>{const old=previousMap.find(p=>p.object_id===stableId(floorId,'object',object.id)&&p.legacy_id===port.id);const row=old?.device_port_id&&byPort.get(old.device_port_id);return old&&row&&samePortReference(old.data,port)?followPortReference(port,row):port;});
      }
      const wire=createProjectBackup(project,parsed.facilityPlan),counts=backupCounts(wire);
      const metadata=omit(project,['buildings','locations','configuration','templates']);
      if(!existing)await insert(c,'projects',[{id,legacy_id:project.id,name:project.siteName,revision,data:metadata,configuration:project.configuration,catalog_present:project.templates!==undefined}]);
      const stored=await this.assets.externalize(wire,id,c);
      const revisions=new Map<string,string>();
      await c.query('UPDATE equipment_templates SET active=false WHERE project_id=$1',[id]);
      for(const [position,t]of (stored.templates??[]).entries()){
        const tid=stableId(id,'template',t.id),hash=digest(t);
        await c.query('INSERT INTO equipment_templates(id,project_id,legacy_id,name,position) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,position=EXCLUDED.position,active=true',[tid,id,t.id,t.name,position]);
        const old=await c.query('SELECT id FROM template_revisions WHERE template_id=$1 AND digest=$2',[tid,hash]);
        let rid=old.rows[0]?.id;
        if(!rid){
          rid=randomUUID();const n=(await c.query('SELECT COALESCE(max(revision),0)+1 AS n FROM template_revisions WHERE template_id=$1',[tid])).rows[0].n;
          const definition=omit(t,['ports']),yaml=t.source?.yaml??null;if(yaml)(definition.source as Record<string,unknown>)=omit(t.source!,['yaml']);
          await insert(c,'template_revisions',[{id:rid,project_id:id,template_id:tid,revision:n,digest:hash,definition,source_yaml:yaml,source_metadata:yaml?parseDocument(yaml).toJS({maxAliasCount:0}):null}]);
          await insert(c,'template_revision_ports',t.ports.map((p,slot)=>({id:randomUUID(),revision_id:rid,port_identity:stableId(tid,'slot',String(slot)),slot,name:p.name??String(slot),face:p.face??'front',x:p.x,y:p.y,width:p.width,height:p.height,data:p})));
        }
        await c.query('UPDATE equipment_templates SET current_revision_id=$1 WHERE id=$2',[rid,tid]);revisions.set(t.id,rid);
      }
      for(const table of tables)await c.query(`DELETE FROM ${table} WHERE project_id=$1`,[id]);
      const rows=new Map<string,Row[]>();const add=(table:string,row:Row)=>{if(!rows.has(table))rows.set(table,[]);rows.get(table)!.push(row);};
      stored.buildings.forEach((b,position)=>add('buildings',{id:stableId(id,'building',b.id),project_id:id,legacy_id:b.id,name:b.name,data:b,position}));
      const endpoints=new Map<string,string>();
      stored.locations.forEach((f,position)=>{
        const fid=stableId(id,'frame',f.id),layoutData=omit(f.layout,['racks','cables']);
        for(const key of ['portVlans','portDetails','portMedia'])if(key in layoutData)layoutData[key]={};
        add('distribution_frames',{id:fid,project_id:id,building_id:stableId(id,'building',f.buildingId),legacy_id:f.id,name:f.name,kind:f.type,data:omit(f,['layout']),layout_data:layoutData,position});
        f.layout.racks.forEach((r,position)=>{
          const rackId=stableId(fid,'rack',r.id);add('racks',{id:rackId,project_id:id,frame_id:fid,legacy_id:r.id,label:r.label,height_u:r.heightU,data:omit(r,['equipment']),position});
          r.equipment.forEach((e,position)=>{
            e.templateRevisionId=e.templateId?revisions.get(e.templateId):undefined;
            add('equipment',{id:e.databaseId,project_id:id,rack_id:rackId,legacy_id:e.id,label:e.label,template_revision_id:e.templateRevisionId??null,bottom_u:e.bottomU,height_u:e.heightU,data:e,position});
            portNumbers(e).forEach((number,slot)=>{
              const key=endpointKey({rackId:r.id,equipmentId:e.id,port:number}),pid=e.databasePortIds![slot];endpoints.set(`${f.id}/${key}`,pid);
              add('device_ports',{id:pid,project_id:id,equipment_id:e.databaseId,slot,number,vlan:f.layout.portVlans?.[key]??null,details:f.layout.portDetails?.[key]??null,media:f.layout.portMedia?.[key]??null});
            });
          });
        });
        f.layout.cables.forEach((cable,position)=>{
          const cid=stableId(fid,'cable',cable.id);add('cables',{id:cid,project_id:id,frame_id:fid,legacy_id:cable.id,data:omit(cable,['from','to']),position});
          for(const side of ['from','to']as const){const pid=endpoints.get(`${f.id}/${endpointKey(cable[side])}`);if(!pid)throw new HttpError(400,'Cable references an unknown port.');add('cable_endpoints',{project_id:id,cable_id:cid,side,port_id:pid});}
        });
      });
      if(stored.facilityPlan){
        const floor=stored.facilityPlan,fid=stableId(id,'floor',floor.id),index=rackPortIndex(project);
        add('floors',{id:fid,project_id:id,legacy_id:floor.id,building_name:floor.building,name:floor.floor,data:omit(floor,['layers','objects'])});
        floor.layers.forEach((layer,position)=>add('floor_layers',{id:stableId(fid,'layer',layer.id),project_id:id,floor_id:fid,legacy_id:layer.id,position,data:layer}));
        floor.objects.forEach((o,position)=>{
          const oid=stableId(fid,'object',o.id),data=omit(o,['ports']);if(o.ports)data.ports=[];
          add('map_objects',{id:oid,project_id:id,floor_id:fid,layer_id:stableId(fid,'layer',o.layerId),legacy_id:o.id,position,kind:o.kind,x:o.x,y:o.y,data});
          o.ports?.forEach((p,position)=>{const linked=resolveFloorPort(p,index);add('map_ports',{id:stableId(oid,'port',p.id),project_id:id,object_id:oid,legacy_id:p.id,position,device_port_id:linked?endpoints.get(linked.key)??null:null,data:p});});
        });
      }
      for(const table of ['buildings','distribution_frames','racks','equipment','device_ports','cables','cable_endpoints','floors','floor_layers','map_objects','map_ports'])await insert(c,table,rows.get(table)??[]);
      await c.query('UPDATE projects SET name=$1,revision=$2,data=$3,configuration=$4,catalog_present=$5,updated_at=now() WHERE id=$6',[project.siteName,revision,metadata,project.configuration,project.templates!==undefined,id]);
      await insert(c,'project_events',[{id:randomUUID(),project_id:id,revision,action:isNew?'import':'save',actor:options.actor,summary:{...counts,...(options.sourceHash?{sourceHash:options.sourceHash}:{})}}]);
      return {id,revision,counts};
    });
  }
}
// Strip server identity annotations for migration equivalence checks. All user
// fields, geometry, files and references must otherwise be exactly preserved.
export function withoutServerIds(value:ProjectBackup):ProjectBackup {
  const copy=structuredClone(value);
  for(const f of copy.locations)for(const r of f.layout.racks)for(const e of r.equipment){delete e.databaseId;delete e.databasePortIds;delete e.templateRevisionId;}
  return copy;
}
