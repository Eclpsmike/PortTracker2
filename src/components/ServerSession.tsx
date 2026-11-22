import { useEffect, useState, type ReactNode } from 'react';
import { activateRemoteStore, api, ApiError, ServerStore, type LoadedProject, type ServerUser } from '../serverStorage';
import { downloadFile } from '../facility/storage';
import './serverSession.css';
type ProjectRow={id:string;name:string;revision:number};
function Login({onLogin,username:initial=''}:{onLogin:(user:ServerUser)=>void;username?:string}){
  const [username,setUsername]=useState(initial),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <form className="server-login" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const result=await api<{user:ServerUser}>('/auth/login',{method:'POST',body:JSON.stringify({username,password})});setPassword('');onLogin(result.user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <h1>Sign in to PortTracker</h1><p>Open your shared projects and saved floor plans.</p>
    <label>Username<input autoComplete="username" required value={username} readOnly={!!initial} onChange={e=>setUsername(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}<button className="primary-button" disabled={busy} type="submit">{busy?'Signing in…':'Sign in'}</button>
  </form>;
}
function AccountSettings({user,onPasswordChanged}:{user:ServerUser;onPasswordChanged:()=>void}){
  const [users,setUsers]=useState<(ServerUser&{disabled:boolean})[]>([]),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState('editor'),[oldPassword,setOldPassword]=useState(''),[newPassword,setNewPassword]=useState('');
  const refresh=()=>api<{users:typeof users}>('/users').then(r=>setUsers(r.users));
  useEffect(()=>{if(user.role==='admin')void refresh().catch(e=>setError(e.message));},[user.role]);
  async function change(id:string,patch:object){setError('');try{await api(`/users/${id}`,{method:'PATCH',body:JSON.stringify(patch)});await refresh();}catch(e){setError((e as Error).message);}}
  return <section className="server-account" aria-label="Account settings"><h2>Account settings</h2>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <form onSubmit={async e=>{e.preventDefault();setError('');try{await api('/auth/password',{method:'POST',body:JSON.stringify({currentPassword:oldPassword,password:newPassword})});onPasswordChanged();}catch(e){setError((e as Error).message);}}}><h3>Change password</h3><label>Current password<input type="password" autoComplete="current-password" required value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button className="secondary-button">Save password and sign out</button></form>
    {user.role==='admin'&&<><h3>Users</h3><table><thead><tr><th>Username</th><th>Role</th><th>Access</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.username}</td><td><select aria-label={`Role for ${u.username}`} disabled={u.id===user.id} value={u.role} onChange={e=>void change(u.id,{role:e.target.value})}><option>admin</option><option>editor</option><option>viewer</option></select></td><td><button disabled={u.id===user.id} onClick={()=>void change(u.id,{disabled:!u.disabled})}>{u.disabled?'Enable':'Disable'}</button></td></tr>)}</tbody></table>
      <form onSubmit={async e=>{e.preventDefault();setError('');setMessage('');try{await api('/users',{method:'POST',body:JSON.stringify({username,password,role})});setUsername('');setPassword('');await refresh();setMessage('User created.');}catch(e){setError((e as Error).message);}}}><h3>Add user</h3><label>New username<input required pattern="[a-zA-Z0-9_.-]{3,80}" autoComplete="off" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Initial password<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Role<select value={role} onChange={e=>setRole(e.target.value)}><option>editor</option><option>viewer</option><option>admin</option></select></label><button className="primary-button">Create user</button></form></>}
  </section>;
}
export function ServerSession({children}:{children:ReactNode}){
  const [user,setUser]=useState<ServerUser|null>(null),[checking,setChecking]=useState(true),[error,setError]=useState(''),[projects,setProjects]=useState<ProjectRow[]>([]),[store,setStore]=useState<ServerStore|null>(null),[account,setAccount]=useState(false),[reauth,setReauth]=useState(false),[version,render]=useState(0);
  useEffect(()=>{let live=true;void api<{user:ServerUser}>('/auth/session').then(r=>{if(live)setUser(r.user);}).catch(e=>{if(live&&(!(e instanceof ApiError)||e.status!==401))setError('The backend is unavailable. Start the API server and try again.');}).finally(()=>{if(live)setChecking(false);});return()=>{live=false;};},[]);
  async function open(id:string,currentUser:ServerUser=user!){
    setError('');try{if(store?.dirty){if(!window.confirm('Save current changes before opening another project?'))return;await store.flush();}const loaded=await api<LoadedProject>(`/projects/${id}`);store?.dispose();const next=new ServerStore(loaded,currentUser);activateRemoteStore(next);setStore(next);}catch(e){setError((e as Error).message);}
  }
  useEffect(()=>{if(!user)return;let live=true;void api<{projects:ProjectRow[]}>('/projects').then(async r=>{if(!live)return;setProjects(r.projects);if(r.projects.length){const loaded=await api<LoadedProject>(`/projects/${r.projects[0].id}`);if(!live)return;const next=new ServerStore(loaded,user);activateRemoteStore(next);setStore(next);}}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[user]);
  useEffect(()=>{if(!store)return;const unsubscribe=store.subscribe(()=>render(n=>n+1));const before=(e:BeforeUnloadEvent)=>{if(store.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{unsubscribe();window.removeEventListener('beforeunload',before);};},[store]);
  useEffect(()=>{if(store&&!projects.some(p=>p.id===store.id))void api<{projects:ProjectRow[]}>('/projects').then(r=>setProjects(r.projects));},[store,projects,version]);
  function clear(){store?.dispose();activateRemoteStore(null);setStore(null);setUser(null);setAccount(false);}
  async function logout(){setError('');try{await store?.flush();await api('/auth/logout',{method:'POST',body:'{}'});clear();}catch(e){setError((e as Error).message);}}
  const exportPending=()=>{if(store)downloadFile('porttracker-project.json',new Blob([JSON.stringify(store.snapshot(),null,2)],{type:'application/json'}));};
  if(checking)return <main className="server-loading" role="status">Connecting to PortTracker…</main>;
  if(!user)return <main>{error&&<p role="alert" className="server-error">{error} <button onClick={()=>location.reload()}>Retry connection</button></p>}<Login onLogin={u=>{setError('');setUser(u);}}/></main>;
  return <>
    <div className="server-session"><strong>{user.username} · {user.role}</strong><label>Project<select aria-label="Server project" value={store?.id??''} onChange={e=>void open(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <span role="status" data-testid="server-save-status">{user.role==='viewer'?'Read-only access':store?.error?'Changes not saved':store?.saving?'Saving to server…':store?.dirty?'Unsaved changes':'Saved to server'}</span><button onClick={async()=>{try{await store?.flush();setAccount(!account);}catch(e){setError((e as Error).message);}}}>Account</button><button onClick={()=>void logout()}>Sign out</button>
    </div>
    {error&&<p className="server-error" role="alert">{error}</p>}
    {store?.error&&<div className="server-error" role="alert"><span>{store.error.message}</span><button onClick={exportPending}>Export unsaved changes</button>{store.error instanceof ApiError&&store.error.status===401?<button onClick={()=>setReauth(true)}>Sign in again</button>:<button disabled={store.error instanceof ApiError&&store.error.status===409} onClick={()=>void store.retry().catch(()=>{})}>Retry save</button>}<button onClick={()=>{if(window.confirm('Reload the server version and discard local unsaved changes? Export them first to keep a copy.')){store.dirty=false;location.reload();}}}>Reload server version</button></div>}
    {reauth&&<Login username={user.username} onLogin={u=>{if(u.id!==user.id){setError('Sign in using the same account to recover these changes.');return;}setReauth(false);void store?.retry().catch(()=>{});}}/>}
    {account&&<AccountSettings user={user} onPasswordChanged={clear}/>}
    {store?<div key={`${store.id}/${user.id}`} inert={account||reauth} className={user.role==='viewer'?'server-viewer':''}>{children}</div>:<main className="server-loading">{projects.length?'Opening project…':'No projects yet. Import a project backup to get started.'}{!projects.length&&user.role!=='viewer'&&<label>Project backup<input type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>128*1024*1024)throw new Error('Backup exceeds 128 MB.');const loaded=await api<LoadedProject>('/projects',{method:'POST',body:await f.text()});const next=new ServerStore(loaded,user);activateRemoteStore(next);setStore(next);setProjects([{id:loaded.id,name:loaded.backup.siteName,revision:loaded.revision}]);}catch(e){setError((e as Error).message);}}}/></label>}</main>}
  </>;
}
