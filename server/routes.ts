import type { FastifyInstance } from 'fastify';
import { ProjectRepository, HttpError } from './repository';
import { requireRole } from './auth';
export function registerProjectRoutes(app:FastifyInstance,repository:ProjectRepository){
  app.get('/api/projects',async()=>({projects:await repository.list()}));
  app.get<{Params:{id:string}}>('/api/projects/:id',async(request,reply)=>{const result=await repository.load(request.params.id);reply.header('ETag',`"${result.revision}"`);return result;});
  app.get<{Params:{id:string}}>('/api/projects/:id/export',async(request,reply)=>{const result=await repository.load(request.params.id);reply.header('Content-Disposition','attachment; filename="porttracker-project.json"');return result.backup;});
  app.post('/api/projects',async request=>{requireRole(request,['admin','editor']);const saved=await repository.save(request.body,{actor:request.user!.username});return repository.load(saved.id);});
  app.put<{Params:{id:string}}>('/api/projects/:id',async(request,reply)=>{
    requireRole(request,['admin','editor']);const match=/^"?([1-9][0-9]*)"?$/.exec(String(request.headers['if-match']??''));
    if(!match)throw new HttpError(428,'A project revision is required. Reload the project.');
    const result=await repository.save(request.body,{id:request.params.id,expectedRevision:Number(match[1]),actor:request.user!.username});reply.header('ETag',`"${result.revision}"`);return {id:result.id,revision:result.revision};
  });
}
