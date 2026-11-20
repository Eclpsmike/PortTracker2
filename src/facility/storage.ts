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
export async function readFloorPlan(projectId: string): Promise<FloorPlan | null> {
  const db = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('plans').objectStore('plans').get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return value === undefined ? null : parseFloorPlan(value);
  } finally { db.close(); }
}
// Serialize writes across page unmounts so an older save cannot replace a newer edit.
let saves: Promise<void> = Promise.resolve();
export function saveFloorPlan(projectId: string, plan: FloorPlan): Promise<void> {
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
export function exportFloorPlan(plan: FloorPlan) {
  downloadFile(`facility-${plan.floor.replace(/[^\w-]+/g, '-').toLowerCase()}.json`, new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
}
