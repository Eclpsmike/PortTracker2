import { validPortRange } from './portNumbering';
import { validPortMedia } from './media';
import { parseDocument } from 'yaml';
import { EQUIPMENT_TEMPLATES, type EquipmentTemplate, type TemplatePort } from './equipmentTemplates';
import type { EquipmentKind } from './model';

export interface DefinitionPort { name: string; type: string }
export interface DeviceDefinition { manufacturer: string; model: string; heightU: number; kind: EquipmentKind; ports: DefinitionPort[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const bounded = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function parseDeviceDefinition(source: string): DeviceDefinition {
  if (source.length > 512 * 1024) throw new Error('Choose a YAML definition smaller than 512 KB.');
  const document = parseDocument(source, { uniqueKeys: true, strict: true, merge: false });
  if (document.errors.length || document.warnings.length) throw new Error(`Cannot read YAML: ${(document.errors[0] ?? document.warnings[0]).message}`);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!record(value) || !text(value.model) || !text(value.manufacturer) || !Number.isInteger(value.u_height) || !bounded(value.u_height, 1, 42)) throw new Error('The definition needs manufacturer, model, and a whole-number u_height from 1 to 42.');
  const kind = Array.isArray(value['front-ports']) && value['front-ports'].length ? 'patch-panel' : 'switch';
  const raw = kind === 'patch-panel' ? value['front-ports'] : value.interfaces;
  if (!Array.isArray(raw) || !raw.length || raw.length > 256) throw new Error('Choose a definition with 1–256 front ports or interfaces.');
  const ports: DefinitionPort[] = [];
  for (const item of raw) {
    if (!record(item) || !text(item.name) || !text(item.type)) throw new Error('Every port needs a name and type.');
    // NetBox's generic patch panels use compact names such as Port [1-24].
    const match = item.name.match(/\[(\d+)-(\d+)\]/);
    const names: string[] = [];
    if (match) {
      const start = Number(match[1]), end = Number(match[2]);
      if (end < start || end - start > 255) throw new Error('Port ranges must be ascending and contain no more than 256 ports.');
      for (let n = start; n <= end; n++) names.push(item.name.replace(match[0], String(n)));
    } else names.push(item.name);
    for (const name of names) {
      if (ports.some(port => port.name === name)) throw new Error(`Duplicate port name: ${name}`);
      ports.push({ name, type: item.type });
      if (ports.length > 256) throw new Error('Choose a definition with no more than 256 ports.');
    }
  }
  return { manufacturer: value.manufacturer.trim(), model: value.model.trim(), heightU: value.u_height, kind, ports };
}
export function validTemplatePort(value: unknown): value is TemplatePort {
  if (!record(value) || !bounded(value.x, 0, 1) || !bounded(value.y, 0, 1) || !bounded(value.width, .001, 1) || !bounded(value.height, .001, 1) || !text(value.name) || (value.interfaceType !== undefined && !text(value.interfaceType))) return false;
  if (value.media !== undefined && !validPortMedia(value.media)) return false;
  return value.x - value.width / 2 >= -1e-9 && value.x + value.width / 2 <= 1 + 1e-9 && value.y - value.height / 2 >= -1e-9 && value.y + value.height / 2 <= 1 + 1e-9;
}
export function validImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1400000) return false;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(match[2].slice(0, 32));
    return match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  } catch { return false; }
}
export function validCustomTemplates(value: unknown): value is EquipmentTemplate[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  const ids = new Set(EQUIPMENT_TEMPLATES.map(t => t.id));
  let bytes = 0;
  for (const t of value) {
    if (!record(t) || !text(t.id, 100) || !/^custom-[\w-]+$/.test(t.id) || ids.has(t.id) || !text(t.name, 100) || !['switch', 'patch-panel'].includes(String(t.kind)) || !Number.isInteger(t.heightU) || !bounded(t.heightU, 1, 42) || !Number.isInteger(t.portCount) || !bounded(t.portCount, 1, 256) || !validImageSource(t.imageSrc) || !Number.isInteger(t.imageWidth) || !bounded(t.imageWidth, 1, 8192) || !Number.isInteger(t.imageHeight) || !bounded(t.imageHeight, 1, 8192) || t.imageWidth * t.imageHeight > 32000000 || typeof t.description !== 'string' || t.description.length > 2000 || !record(t.source) || !text(t.source.manufacturer) || !text(t.source.model) || !text(t.source.filename) || !Array.isArray(t.ports) || t.ports.length !== t.portCount || !t.ports.every(validTemplatePort)) return false;
    if (!validPortRange(t.portStart === undefined ? 1 : t.portStart, Number(t.portCount))) return false;
    if (new Set(t.ports.map(p => p.name)).size !== t.portCount) return false;
    if (new Set(t.ports.map(p => `${p.x}/${p.y}`)).size !== t.portCount) return false;
    // Overlapping socket hit targets would make one port impossible to select.
    for (let i = 0; i < t.ports.length; i++) for (let j = 0; j < i; j++) {
      const a = t.ports[i], b = t.ports[j];
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-9 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-9) return false;
    }
    ids.add(t.id); bytes += t.imageSrc.length;
  }
  return bytes <= 4000000;
}
export async function readTemplateImage(file: File): Promise<Pick<EquipmentTemplate, 'imageSrc' | 'imageWidth' | 'imageHeight'>> {
  if (file.size > 1024 * 1024) throw new Error('Choose an image up to 1 MB.');
  const imageSrc = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file);
  });
  if (!validImageSource(imageSrc)) throw new Error('Choose a PNG, JPEG, or WebP image. SVG files are not supported.');
  const image = new Image(); image.src = imageSrc;
  try { await image.decode(); } catch { throw new Error('This image could not be decoded.'); }
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 32000000) throw new Error('Choose an image up to 8192 pixels per side and 32 megapixels.');
  return { imageSrc, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight };
}
export function gridPorts(names: string[], columns: number, order: 'rows' | 'columns', left: number, right: number, top: number, bottom: number, width: number, height: number): TemplatePort[] {
  if (!Number.isInteger(columns) || columns < 1 || columns > names.length || ![left, right, top, bottom, width, height].every(Number.isFinite) || left > right || top > bottom) throw new Error('Enter valid grid bounds and column count.');
  const rows = Math.ceil(names.length / columns);
  return names.map((name, i) => {
    const column = order === 'rows' ? i % columns : Math.floor(i / rows), row = order === 'rows' ? Math.floor(i / columns) : i % rows;
    return { name, x: columns === 1 ? left : left + column / (columns - 1) * (right - left), y: rows === 1 ? top : top + row / (rows - 1) * (bottom - top), width, height };
  });
}
