import { importProject, parseProject, saveProject, type Project } from './project';
import { parseFloorPlan, type FloorPlan } from './facility/model';
import { deleteFloorPlan, downloadFile, readFloorPlan, saveFloorPlan } from './facility/storage';

export const MAX_PROJECT_BACKUP_BYTES = 128 * 1024 * 1024;
export interface ProjectBackup extends Project {
  kind: 'porttracker-backup';
  backupVersion: 1;
  facilityPlan: FloorPlan | null;
}
export interface ImportedProjectBackup {
  project: Project;
  facilityPlan: FloorPlan | null;
  legacy: boolean;
}

export function parseProjectBackup(value: unknown): ImportedProjectBackup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid or unsupported project backup.');
  const data = value as Record<string, unknown>;
  const combined = 'backupVersion' in data || 'facilityPlan' in data || 'kind' in data;
  if (combined && (data.kind !== 'porttracker-backup' || data.backupVersion !== 1 || !('facilityPlan' in data))) {
    throw new Error('Invalid or unsupported project backup version.');
  }
  const { kind: _kind, backupVersion: _version, facilityPlan, ...rackProject } = data;
  const project = importProject(rackProject);
  if (!project) throw new Error('Invalid or unsupported project. Check the distribution frames, ports, VLAN references, and file version.');
  return { project, facilityPlan: combined && facilityPlan !== null ? parseFloorPlan(structuredClone(facilityPlan)) : null, legacy: !combined };
}

export function createProjectBackup(project: Project, floor: FloorPlan | null): ProjectBackup {
  if (!parseProject(project)) throw new Error('The current project cannot be backed up because it contains invalid data.');
  return { ...structuredClone(project), kind: 'porttracker-backup', backupVersion: 1, facilityPlan: floor === null ? null : parseFloorPlan(structuredClone(floor)) };
}

export async function exportProjectBackup(project: Project, currentPlan?: FloorPlan): Promise<void> {
  // readFloorPlan includes pending/failed saves from this tab, so the download
  // does not depend on IndexedDB having finished writing the latest edit.
  const floor = currentPlan ?? await readFloorPlan(project.id);
  const backup = createProjectBackup(project, floor);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_PROJECT_BACKUP_BYTES) throw new Error('The project exceeds the 128 MB backup limit.');
  downloadFile('porttracker-project.json', blob);
}

export async function restoreProjectBackup(backup: ImportedProjectBackup): Promise<Project> {
  // Stage the drawing under a fresh local project ID. Only switch the active
  // localStorage record after IndexedDB commits, leaving the old pair intact
  // if either storage operation fails. Equipment/frame/port IDs stay unchanged.
  const checked = parseProjectBackup(createProjectBackup(backup.project, backup.facilityPlan));
  const project = { ...checked.project, id: crypto.randomUUID() };
  try {
    if (checked.facilityPlan) await saveFloorPlan(project.id, checked.facilityPlan);
    if (!saveProject(project)) throw new Error('Browser storage is unavailable. The current project and drawing were not replaced.');
  } catch (error) {
    await deleteFloorPlan(project.id).catch(() => {});
    throw error;
  }
  return project;
}
