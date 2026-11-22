import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createPool } from '../server/db';
import { configFromEnv } from '../server/config';
import { AssetStore } from '../server/assets';
import { ProjectRepository } from '../server/repository';
import { createUser } from '../server/auth';
import { locationPortsFixture } from './location-ports-fixture';
import { createProjectBackup } from '../src/projectBackup';
const config=configFromEnv(),db=createPool(config.databaseUrl),repo=new ProjectRepository(db,new AssetStore(config.assetRoot));
let id:string,editor:string,viewer:string;const password='Browser-test-'+randomUUID();const users:string[]=[];
test.beforeEach(async()=>{
  const fixture=locationPortsFixture();fixture.project.id=randomUUID();fixture.project.siteName='Server browser test';
  const created=await repo.save(createProjectBackup(fixture.project,fixture.plan),{actor:'browser-test'});id=created.id;
  const suffix=randomUUID().slice(0,8),a=await createUser(db,`editor-${suffix}`,password,'editor'),b=await createUser(db,`viewer-${suffix}`,password,'viewer');editor=a.username;viewer=b.username;users.push(a.id,b.id);
});
test.afterEach(async()=>{await db.query('DELETE FROM projects WHERE id=$1',[id]);await db.query('DELETE FROM app_users WHERE id=ANY($1::uuid[])',[users]);await rm(join(config.assetRoot,id),{recursive:true,force:true});});
test.afterAll(async()=>{await db.end();});
async function login(page:Page,username=editor){
  // Isolate the UI from real migrated projects while exercising the real API.
  await page.route('**/api/projects',async route=>{if(route.request().method()!=='GET'){await route.continue();return;}const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{projects:body.projects.filter((p:{id:string})=>p.id===id)}});});
  await page.goto('/#/locations');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByLabel('Site name',{exact:true})).toHaveValue('Server browser test');
  await expect(page.getByTestId('server-save-status')).toContainText(username===viewer?'Read-only':'Saved to server');
}
test('server login, rack and map edits persist across a fresh browser without browser project storage',async({page,browser})=>{
  await login(page);await page.getByLabel('Site name',{exact:true}).fill('Saved through server');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await expect(page.getByTestId('server-save-status')).toHaveText('Saved to server');await expect.poll(async()=>(await repo.load(id)).backup.siteName).toBe('Saved through server');
  expect(await page.evaluate(()=>localStorage.getItem('porttracker.project'))).toBeNull();
  await page.getByRole('link',{name:'Facility',exact:true}).click();await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();
  const plan=structuredClone((await repo.load(id)).backup.facilityPlan!);plan.floor='Server map edit';
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'drawing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
  await expect.poll(async()=>(await repo.load(id)).backup.facilityPlan!.floor).toBe('Server map edit');await expect(page.getByTestId('server-save-status')).toHaveText('Saved to server');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();const backup=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(backup.siteName).toBe('Saved through server');expect(backup.facilityPlan.floor).toBe('Server map edit');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to PortTracker',exact:true})).toBeVisible();
  const context=await browser.newContext(),other=await context.newPage();
  await other.route('**/api/projects',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{projects:body.projects.filter((p:{id:string})=>p.id===id)}});});
  await other.goto('http://127.0.0.1:5189/#/locations');await other.getByLabel('Username',{exact:true}).fill(editor);await other.getByLabel('Password',{exact:true}).fill(password);await other.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(other.getByLabel('Site name',{exact:true})).toHaveValue('Saved through server');await other.getByRole('link',{name:'Facility',exact:true}).click();await expect(other.locator('.floor-title')).toContainText('Server map edit');await context.close();
});
test('concurrent changes stop stale saves and keep an exportable local copy',async({page})=>{
  await login(page);const before=await repo.load(id);before.backup.siteName='Another session';await repo.save(before.backup,{id,expectedRevision:before.revision,actor:'other-session'});
  await page.getByLabel('Site name',{exact:true}).fill('My unsaved work');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await expect(page.locator('.server-error')).toContainText('another session');expect((await repo.load(id)).backup.siteName).toBe('Another session');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export unsaved changes',exact:true}).click();const backup=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(backup.siteName).toBe('My unsaved work');
});
test('viewer cannot persist rack or map edits',async({page})=>{
  await login(page,viewer);const before=await repo.load(id);
  await page.getByLabel('Site name',{exact:true}).fill('Viewer attempt');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await page.getByRole('link',{name:'Facility',exact:true}).click();await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();
  const floor=structuredClone(before.backup.facilityPlan!);floor.floor='Viewer map attempt';page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(floor))});
  await expect(page.getByRole('alert')).toContainText('read-only');expect((await repo.load(id)).backup.siteName).toBe(before.backup.siteName);expect((await repo.load(id)).backup.facilityPlan!.floor).toBe(before.backup.facilityPlan!.floor);
});
test('network failures retain edits and Retry save persists them',async({page})=>{
  await login(page);
  await page.route('**/api/projects/*',async route=>{if(route.request().method()==='PUT')await route.abort('failed');else await route.continue();});
  await page.getByLabel('Site name',{exact:true}).fill('Recovered after outage');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await expect(page.getByTestId('server-save-status')).toHaveText('Changes not saved');expect((await repo.load(id)).backup.siteName).not.toBe('Recovered after outage');
  await page.unroute('**/api/projects/*');await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await expect(page.getByTestId('server-save-status')).toHaveText('Saved to server');expect((await repo.load(id)).backup.siteName).toBe('Recovered after outage');
});
test('expired sessions can sign in again without losing pending changes',async({page})=>{
  await login(page);await db.query('DELETE FROM sessions WHERE user_id=(SELECT id FROM app_users WHERE username=$1)',[editor]);
  await page.getByLabel('Site name',{exact:true}).fill('Recovered after sign in');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await expect(page.getByTestId('server-save-status')).toHaveText('Changes not saved');await page.getByRole('button',{name:'Sign in again',exact:true}).click();
  await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByTestId('server-save-status')).toHaveText('Saved to server');expect((await repo.load(id)).backup.siteName).toBe('Recovered after sign in');
});
test('account password changes revoke the session and allow a new login',async({page})=>{
  await login(page);await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByLabel('Current password',{exact:true}).fill(password);await page.getByLabel('New password',{exact:true}).fill(password+'-new');
  await page.getByRole('button',{name:'Save password and sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to PortTracker',exact:true})).toBeVisible();
  await page.getByLabel('Username',{exact:true}).fill(editor);await page.getByLabel('Password',{exact:true}).fill(password+'-new');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByLabel('Site name',{exact:true})).toHaveValue('Server browser test');
});
