import { followFloorPortIdentities } from './facility/portIdentityLinks';
import type { Project } from './project';
import type { FloorPlan } from './facility/model';
import type { ProjectBackup, ImportedProjectBackup } from './projectBackup';
export interface ServerUser {id:string;username:string;role:'admin'|'editor'|'viewer'}
export class ApiError extends Error {constructor(readonly status:number,message:string){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api${path}`,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const result=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
  if(!response.ok)throw new ApiError(response.status,result.error??'The request failed.');return result as T;
}
export interface LoadedProject {id:string;revision:number;backup:ProjectBackup}
let current:ServerStore|null=null;
export const remoteStore=()=>current;
export function activateRemoteStore(store:ServerStore|null){current=store;}
export function withServerIdentities(project:Project):Project {
  const copy=structuredClone(project),seen=new Set<string>();
  for(const f of copy.locations)for(const r of f.layout.racks)for(const e of r.equipment){
    if(!e.databaseId||seen.has(e.databaseId)){e.databaseId=crypto.randomUUID();e.databasePortIds=[];}
    seen.add(e.databaseId);
    e.databasePortIds=Array.from({length:e.portCount},(_,i)=>{let id=e.databasePortIds?.[i];if(!id||seen.has(id))id=crypto.randomUUID();seen.add(id);return id;});
  }
  return copy;
}
export class ServerStore {
  id:string;revision:number;project:Project;floor:FloorPlan|null;error:Error|null=null;dirty=false;saving=false;
  private timer:ReturnType<typeof setTimeout>|undefined;private inflight:Promise<void>|null=null;private sequence=0;private listeners=new Set<()=>void>();
  constructor(loaded:LoadedProject,readonly user:ServerUser){this.id=loaded.id;this.revision=loaded.revision;const {kind:_k,backupVersion:_v,facilityPlan,...project}=loaded.backup;this.project=project;this.floor=facilityPlan;}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private emit(){this.listeners.forEach(fn=>fn());}
  snapshot():ProjectBackup{return structuredClone({...this.project,kind:'porttracker-backup',backupVersion:1,facilityPlan:this.floor});}
  updateProject(project:Project){if(this.user.role==='viewer')return;if(JSON.stringify(project)===JSON.stringify(this.project))return;this.floor=followFloorPortIdentities(this.project,project,this.floor);this.project=project;this.changed();}
  updateFloor(floor:FloorPlan){if(this.user.role==='viewer')throw new Error('This account has read-only access.');if(JSON.stringify(floor)===JSON.stringify(this.floor))return;this.floor=floor;this.changed();}
  private changed(){this.sequence++;this.dirty=true;this.emit();if(this.timer)clearTimeout(this.timer);if(!this.error)this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},600);}
  flush():Promise<void>{
    if(this.timer)clearTimeout(this.timer);
    if(this.inflight)return this.inflight;
    if(this.error)return Promise.reject(this.error);
    if(!this.dirty)return Promise.resolve();
    const drain=async()=>{
      while(this.dirty){
        if(this.error)throw this.error;
        const sequence=this.sequence,backup=this.snapshot();this.saving=true;this.emit();
        try{const result=await api<{revision:number}>(`/projects/${this.id}`,{method:'PUT',headers:{'If-Match':`"${this.revision}"`},body:JSON.stringify(backup)});this.revision=result.revision;if(sequence===this.sequence)this.dirty=false;}
        catch(error){this.error=error instanceof Error?error:new Error('Save failed.');throw this.error;}
        finally{this.saving=false;this.emit();}
      }
    };
    this.inflight=drain().finally(()=>{this.inflight=null;});return this.inflight;
  }
  async retry(){if(this.error instanceof ApiError&&this.error.status===409)throw this.error;this.error=null;await this.flush();this.emit();}
  async importBackup(backup:ImportedProjectBackup){
    await this.flush();const payload={...backup.project,kind:'porttracker-backup',backupVersion:1,facilityPlan:backup.facilityPlan};
    let loaded:LoadedProject;
    if(backup.project.id===this.project.id){await api(`/projects/${this.id}`,{method:'PUT',headers:{'If-Match':`"${this.revision}"`},body:JSON.stringify(payload)});loaded=await api<LoadedProject>(`/projects/${this.id}`);}
    else loaded=await api<LoadedProject>('/projects',{method:'POST',body:JSON.stringify(payload)});
    this.id=loaded.id;this.revision=loaded.revision;const {kind:_k,backupVersion:_v,facilityPlan,...project}=loaded.backup;this.project=project;this.floor=facilityPlan;this.dirty=false;this.error=null;this.emit();return project;
  }
  dispose(){if(this.timer)clearTimeout(this.timer);this.listeners.clear();}
}
