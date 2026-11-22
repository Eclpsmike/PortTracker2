import { remoteStore } from '../serverStorage';
import { parseFloorPlan, type FloorPlan } from './model';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('porttracker-facility', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('plans');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser drawing storage is unavailable.'));
    request.onblocked = () => reject(new Error('Close other PortTracker tabs to upgrade drawing storage.'));
  });
}
// Keep edits exportable across navigation even when browser persistence fails.
const latestPlans = new Map<string, FloorPlan>();
export async function readFloorPlan(projectId: string): Promise<FloorPlan | null> {
  const remote=remoteStore();if(remote){if(projectId!==remote.project.id)throw new Error('Project identity does not match the open server project.');return structuredClone(remote.floor);}
  if (latestPlans.has(projectId)) return structuredClone(latestPlans.get(projectId)!);
  const db = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('plans').objectStore('plans').get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return latestPlans.has(projectId) ? structuredClone(latestPlans.get(projectId)!) : value === undefined ? null : parseFloorPlan(value);
  } finally { db.close(); }
}
// Serialize writes across page unmounts so an older save cannot replace a newer edit.
let saves: Promise<void> = Promise.resolve();
export function saveFloorPlan(projectId: string, plan: FloorPlan): Promise<void> {
  const remote=remoteStore();if(remote){if(projectId!==remote.project.id)return Promise.reject(new Error('Project identity mismatch.'));if(remote.user.role==='viewer')return Promise.resolve();remote.updateFloor(plan);return remote.flush();}
  latestPlans.set(projectId, structuredClone(plan));
  const save = saves.catch(() => {}).then(async () => {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        tx.objectStore('plans').put(plan, projectId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Drawing save was interrupted.'));
      });
    } finally { db.close(); }
  });
  saves = save;
  return save;
}
export function downloadFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function deleteFloorPlan(projectId: string): Promise<void> {
  const remove = saves.catch(() => {}).then(async () => {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        tx.objectStore('plans').delete(projectId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Drawing cleanup was interrupted.'));
      });
    } finally { db.close(); latestPlans.delete(projectId); }
  });
  saves = remove;
  return remove;
}
