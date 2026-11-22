import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './db';
import { transaction } from './db';
import type { ServerConfig } from './config';
import { HttpError } from './repository';
export type Role='admin'|'editor'|'viewer';
export interface User {id:string;username:string;role:Role}
declare module 'fastify' { interface FastifyRequest { user:User|null } }
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1},(e,key)=>e?reject(e):resolve(key)));
export async function passwordHash(password:string){
  if(typeof password!=='string'||password.length<12||password.length>512)throw new HttpError(400,'Use a password between 12 and 512 characters.');
  const salt=randomBytes(16).toString('hex');return `${salt}:${(await derive(password,salt)).toString('hex')}`;
}
async function verify(password:string,stored:string){
  const [salt,encoded]=stored.split(':');const actual=await derive(password,salt),expected=Buffer.from(encoded,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
const token=(request:FastifyRequest)=>request.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('pt_session='))?.slice(11)??'';
function cookie(config:ServerConfig,value:string,age=43200){return `pt_session=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secureCookies?'; Secure':''}`;}
export function requireRole(request:FastifyRequest,roles:Role[]){if(!request.user||!roles.includes(request.user.role))throw new HttpError(403,'Your account does not have permission to make this change.');}
function credentials(body:unknown){
  const value=body as Record<string,unknown>|null;
  if(!value||typeof value.username!=='string'||! /^[a-z0-9_.-]{3,80}$/.test(value.username.toLowerCase())||typeof value.password!=='string'||value.password.length>512)throw new HttpError(400,'Enter a valid username and password.');
  return {username:value.username.toLowerCase(),password:value.password};
}
export async function createUser(db:Database,username:string,password:string,role:Role){
  credentials({username,password});if(!['admin','editor','viewer'].includes(role))throw new HttpError(400,'Choose an existing role.');
  const encoded=await passwordHash(password);
  try{return (await db.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,username,role',[randomUUID(),username.toLowerCase(),encoded,role])).rows[0] as User;}
  catch(error){if((error as {code?:string}).code==='23505')throw new HttpError(409,'That username already exists.');throw error;}
}
export function registerAuth(app:FastifyInstance,db:Database,config:ServerConfig){
  app.decorateRequest('user',null);
  app.addHook('onRequest',async(request,reply)=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)){
      if(!request.headers.origin||!config.origins.includes(request.headers.origin))return reply.code(403).send({error:'Request origin is not allowed.'});
      if(request.headers['content-type']?.split(';')[0]!=='application/json')return reply.code(415).send({error:'Send JSON requests.'});
    }
    const path=request.url.split('?')[0];if(['/api/health','/api/ready','/api/auth/login'].includes(path))return;
    const raw=token(request);
    if(/^[a-f0-9]{64}$/.test(raw)){
      const result=await db.query('SELECT u.id,u.username,u.role FROM sessions s JOIN app_users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND NOT u.disabled',[hash(raw)]);
      request.user=result.rows[0]??null;
    }
    if(!request.user)return reply.code(401).send({error:'Sign in to PortTracker.'});
  });
  app.post('/api/auth/login',{bodyLimit:4096},async(request,reply)=>{
    const input=credentials(request.body),key=hash(request.ip);
    const attempt=await db.query("INSERT INTO auth_attempts(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.attempts+1 END,reset_at=CASE WHEN auth_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.reset_at END RETURNING attempts",[key]);
    if(attempt.rows[0].attempts>15)return reply.code(429).header('Retry-After','900').send({error:'Too many sign-in attempts. Try again in 15 minutes.'});
    const row=(await db.query('SELECT * FROM app_users WHERE username=$1',[input.username])).rows[0];
    const valid=await verify(input.password,row?.password_hash??`${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if(!valid||!row||row.disabled)return reply.code(401).send({error:'Incorrect username or password.'});
    const session=randomBytes(32).toString('hex');
    await transaction(db,async c=>{
      await c.query('DELETE FROM sessions WHERE expires_at<now()');
      await c.query('DELETE FROM auth_attempts WHERE key=$1 OR reset_at<now()',[key]);
      await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[hash(session),row.id]);
    });
    reply.header('Set-Cookie',cookie(config,session));return {user:{id:row.id,username:row.username,role:row.role}};
  });
  app.get('/api/auth/session',async request=>({user:request.user}));
  app.post('/api/auth/logout',async(request,reply)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token(request))]);reply.header('Set-Cookie',cookie(config,'',0));return {ok:true};});
  app.post('/api/auth/password',async(request,reply)=>{
    const input=request.body as {currentPassword?:string;password?:string};
    if(typeof input?.currentPassword!=='string'||input.currentPassword.length>512||typeof input.password!=='string')throw new HttpError(400,'Enter your current and new password.');
    const row=(await db.query('SELECT password_hash FROM app_users WHERE id=$1',[request.user!.id])).rows[0];
    if(!await verify(input.currentPassword,row.password_hash))throw new HttpError(400,'Current password is incorrect.');
    const encoded=await passwordHash(input.password);await transaction(db,async c=>{await c.query('UPDATE app_users SET password_hash=$1 WHERE id=$2',[encoded,request.user!.id]);await c.query('DELETE FROM sessions WHERE user_id=$1',[request.user!.id]);});
    reply.header('Set-Cookie',cookie(config,'',0));return {ok:true};
  });
  app.get('/api/users',async request=>{requireRole(request,['admin']);return {users:(await db.query('SELECT id,username,role,disabled FROM app_users ORDER BY username')).rows};});
  app.post('/api/users',async request=>{requireRole(request,['admin']);const input=credentials(request.body);return {user:await createUser(db,input.username,input.password,(request.body as {role:Role}).role)};});
  app.patch<{Params:{id:string}}>('/api/users/:id',async request=>{
    requireRole(request,['admin']);const input=request.body as {role?:Role;disabled?:boolean;password?:string};
    if(!input||input.role!==undefined&&!['admin','editor','viewer'].includes(input.role)||input.disabled!==undefined&&typeof input.disabled!=='boolean')throw new HttpError(400,'Invalid user settings.');
    const encoded=input.password===undefined?undefined:await passwordHash(input.password);
    return transaction(db,async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtext('porttracker-users'))");
      const target=(await c.query('SELECT * FROM app_users WHERE id=$1 FOR UPDATE',[request.params.id])).rows[0];if(!target)throw new HttpError(404,'User not found.');
      const role=input.role??target.role,disabled=input.disabled??target.disabled;
      if(target.role==='admin'&&!target.disabled&&(role!=='admin'||disabled)&&(await c.query("SELECT count(*)::int AS n FROM app_users WHERE role='admin' AND NOT disabled")).rows[0].n<=1)throw new HttpError(400,'Keep at least one active administrator.');
      await c.query('UPDATE app_users SET role=$1,disabled=$2,password_hash=$3 WHERE id=$4',[role,disabled,encoded??target.password_hash,target.id]);
      await c.query('DELETE FROM sessions WHERE user_id=$1',[target.id]);return {ok:true};
    });
  });
}
