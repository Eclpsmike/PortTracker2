import type { ObjectKind } from './model';
export type FloorIconName = ObjectKind | 'select' | 'pan' | 'measure' | 'calibrate' | 'undo' | 'redo' | 'save' | 'upload' | 'duplicate' | 'lock' | 'unlock' | 'grid' | 'filter';
const paths: Record<FloorIconName, string> = {
  select: 'M5 3l14 10-7 1-3 7z M12 14l4 7', pan: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v10c0 5-3 7-7 7-3 0-4-2-6-4l-4-5a2 2 0 0 1 3-3l2 2',
  outlet: 'M5 4h14v16H5z M8 8h8v6h-2v3h-4v-3H8z', plate: 'M2 5h20v14H2z M5 9h5v6H5z M14 9h5v6h-5z',
  idf: 'M5 2h14v20H5z M8 6h8 M8 11h8 M8 16h8 M8 19h1', ap: 'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01',
  camera: 'M3 5h14v10H3z M17 8l5-3v12l-5-3 M7 15v5h8', printer: 'M6 8V2h12v6 M6 17H3V8h18v9h-3 M6 14h12v8H6z M17 11h1',
  speaker: 'M3 9h4l5-5v16l-5-5H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14',
  device: 'M3 3h18v13H3z M8 21h8 M12 16v5', location: 'M3 3h18v18H3z M3 8h4 M17 16h4',
  cable: 'M3 4h8v16h10 M1 2h4v4H1z M19 18h4v4h-4z', tray: 'M2 6h20v12H2z M6 6v12 M12 6v12 M18 6v12', conduit: 'M3 20V8a5 5 0 0 1 10 0v8a4 4 0 0 0 8 0V3',
  label: 'M4 4h16 M12 4v17 M8 21h8', measure: 'M3 17L17 3l4 4L7 21z M7 13l3 3 M11 9l3 3 M15 5l3 3', calibrate: 'M3 12h18 M3 8v8 M21 8v8 M9 5l3-3 3 3 M12 2v6 M9 19l3 3 3-3 M12 16v6',
  undo: 'M3 10h10a7 7 0 0 1 0 14 M3 10l5-5 M3 10l5 5', redo: 'M21 10H11a7 7 0 0 0 0 14 M21 10l-5-5 M21 10l-5 5',
  save: 'M3 3h15l3 3v15H3z M7 3v6h9V3 M7 21v-8h10v8', upload: 'M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5',
  duplicate: 'M8 8h13v13H8z M4 16H2V2h14v2', lock: 'M5 11h14v11H5z M8 11V6a4 4 0 0 1 8 0v5 M12 15v3', unlock: 'M5 11h14v11H5z M8 11V6a4 4 0 0 1 8 0 M12 15v3',
  grid: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18', filter: 'M3 4h18l-7 8v8l-4 2V12z',
};
export function FloorIcon({ name, size = 19 }: { name: FloorIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
