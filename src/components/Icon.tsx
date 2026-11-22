import type { CSSProperties } from 'react';
export type IconName = 'table' | 'rack' | 'network' | 'cable' | 'ports' | 'info' | 'search' | 'edit' | 'plus' | 'minus' | 'fit' | 'arrow' | 'bidirectional' | 'chevron' | 'close' | 'layers' | 'download' | 'check' | 'settings' | 'trash' | 'reset';
const paths: Record<IconName, string> = {
  table: 'M3 3h18v18H3z M3 9h18 M3 15h18 M10 3v18',
  rack: 'M5 2h14v20H5z M8 6h8 M8 10h8 M8 14h8 M8 18h8',
  network: 'M5 5h14v14H5z M5 5l14 14 M19 5L5 19 M2 2h6v6H2z M16 2h6v6h-6z M2 16h6v6H2z M16 16h6v6h-6z',
  cable: 'M9 15l6-6 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  ports: 'M3 4h18v6H3z M3 14h18v6H3z M7 6v2 M11 6v2 M15 6v2 M7 16v2 M11 16v2 M15 16v2',
  info: 'M12 16v-5 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  edit: 'M15 4l5 5 M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15z',
  plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14',
  fit: 'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
  arrow: 'M4 12h16 M14 6l6 6-6 6', chevron: 'M9 5l7 7-7 7', close: 'M5 5l14 14 M19 5L5 19',
  bidirectional: 'M4 12h16 M9 7l-5 5 5 5 M15 7l5 5-5 5',
  layers: 'M2 8l10-6 10 6-10 6z M2 12l10 6 10-6 M2 16l10 6 10-6',
  download: 'M12 3v12 M7 10l5 5 5-5 M3 16v5h18v-5',
  check: 'M4 12l5 5L20 6', settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  reset: 'M3 10a9 9 0 1 1 2 8 M3 3v7h7',
};
export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
