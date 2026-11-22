import { createHash } from 'node:crypto';
// Deterministic IDs for imported legacy entities. Equipment and device-port
// IDs are also carried in the wire model so moves/renumbering keep identity.
export function stableId(...parts: string[]): string {
  const hex=createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32).split('');
  hex[12]='5';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
  const s=hex.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
