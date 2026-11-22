import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PoolClient } from 'pg';
import { isUuid } from './identity';
import type { Database } from './db';
const MIME = new Set(['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf']);
interface Asset { id:string; sha256:string; mime_type:string; byte_size:number }
export class AssetStore {
  constructor(readonly root:string) {}
  path(projectId:string,hash:string) {
    if(!isUuid(projectId)||! /^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid asset path.');
    return join(this.root,projectId,hash);
  }
  async put(client:PoolClient,projectId:string,dataUrl:string):Promise<string> {
    const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if(!match||!MIME.has(match[1])||match[2].length%4!==0)throw new Error('Unsupported asset encoding.');
    const bytes=Buffer.from(match[2],'base64'),mime=match[1];
    if(!bytes.length||bytes.length>40_000_000||bytes.toString('base64')!==match[2])throw new Error('Invalid or oversized asset.');
    let width:number|null=null,height:number|null=null;
    if(['image/png','image/jpeg','image/webp'].includes(mime)) {
      const image=sharp(bytes,{limitInputPixels:100_000_000}),metadata=await image.metadata();
      if(metadata.format!==({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'} as Record<string,string>)[mime])throw new Error('Image encoding does not match its MIME type.');
      await image.stats();width=metadata.width??null;height=metadata.height??null;
      if(!width||!height||width>20000||height>20000)throw new Error('Image dimensions exceed the supported limit.');
    } else if(mime==='application/pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Invalid PDF signature.');
    else if(mime==='image/svg+xml'&&!/<svg[\s>]/i.test(bytes.toString('utf8')))throw new Error('Invalid SVG source.');
    const hash=createHash('sha256').update(bytes).digest('hex'),file=this.path(projectId,hash);
    await mkdir(join(this.root,projectId),{recursive:true,mode:0o700});
    const temp=`${file}.${randomUUID()}.tmp`;
    await writeFile(temp,bytes,{mode:0o600,flag:'wx'});
    try {await link(temp,file);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}finally{await unlink(temp);}
    const result=await client.query('INSERT INTO assets(id,project_id,sha256,mime_type,byte_size,width,height) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(project_id,sha256,mime_type) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING id',[randomUUID(),projectId,hash,mime,bytes.length,width,height]);
    return result.rows[0].id;
  }
  async bytes(projectId:string,asset:Asset) {
    const bytes=await readFile(this.path(projectId,asset.sha256));
    if(bytes.length!==asset.byte_size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Stored asset integrity check failed.');
    return bytes;
  }
  async externalize<T>(value:T,projectId:string,client:PoolClient):Promise<T> {
    const seen=new Map<string,string>();
    const walk=async(v:unknown):Promise<unknown>=>{
      if(typeof v==='string'&&/^data:(image\/|application\/pdf;)/.test(v)) {
        let id=seen.get(v);if(!id){id=await this.put(client,projectId,v);seen.set(v,id);}return {$porttrackerAsset:id};
      }
      if(Array.isArray(v))return Promise.all(v.map(walk));
      if(v&&typeof v==='object'){const entries=[];for(const [k,x]of Object.entries(v))entries.push([k,await walk(x)]);return Object.fromEntries(entries);}
      return v;
    };
    return await walk(value) as T;
  }
  async hydrate<T>(value:T,projectId:string,db:Pick<Database,'query'>):Promise<T> {
    const assets=await db.query('SELECT id,sha256,mime_type,byte_size FROM assets WHERE project_id=$1',[projectId]);
    const byId=new Map<string,Asset>(assets.rows.map(a=>[a.id,a])),cache=new Map<string,string>();
    const walk=async(v:unknown):Promise<unknown>=>{
      if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&'$porttrackerAsset' in v){
        const id=String(v.$porttrackerAsset);let result=cache.get(id);if(result)return result;
        const asset=byId.get(id);if(!asset)throw new Error('Referenced project asset is missing.');
        result=`data:${asset.mime_type};base64,${(await this.bytes(projectId,asset)).toString('base64')}`;cache.set(id,result);return result;
      }
      if(Array.isArray(v))return Promise.all(v.map(walk));
      if(v&&typeof v==='object'){const entries=[];for(const [k,x]of Object.entries(v))entries.push([k,await walk(x)]);return Object.fromEntries(entries);}
      return v;
    };
    return await walk(value) as T;
  }
}
