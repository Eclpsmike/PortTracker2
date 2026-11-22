import type { PortMedia } from './media';
import type { Equipment, EquipmentKind } from './model';

export type EquipmentSide = 'front' | 'rear';
export const CONSOLE_CONNECTORS = ['RJ45', 'USB-A', 'USB-B', 'USB-C', 'Mini USB', 'Micro USB', 'DB9', 'DB25', 'RJ11', 'RJ12', 'Mini DIN 8', 'Other'] as const;
export type ConsoleConnector = typeof CONSOLE_CONNECTORS[number];
export type PortFunction = 'ethernet' | 'console';
export interface TemplatePort { sourceSection?: 'interfaces' | 'front-ports' | 'console-ports'; manual?: boolean; function?: PortFunction; consoleConnector?: ConsoleConnector; label?: string; face?: EquipmentSide; x: number; y: number; width: number; height: number; name?: string; interfaceType?: string; media?: PortMedia }
export interface EquipmentImage { imageSrc:string; imageWidth:number; imageHeight:number }
export interface EquipmentTemplate {
  id: string; name: string; kind: EquipmentKind; portCount: number; heightU: number; portStart?: number;
  imageSrc: string; imageWidth: number; imageHeight: number; description: string;
  rearImage?: EquipmentImage;
  ports: readonly TemplatePort[];
  source?: { manufacturer: string; model: string; filename: string; yaml?: string };
}
const patchCenters = [81, 135, 189, 242, 296, 350, 425, 479, 533, 587, 640, 694, 769, 823, 877, 930, 984, 1038, 1113, 1167, 1220, 1274, 1328, 1382];
const switchCenters = [120, 144, 167, 191, 215, 239, 268, 292, 315, 339, 363, 387, 416, 440, 463, 487, 511, 535, 564, 588, 611, 635, 659, 683];
// Socket bounds measured on the unmodified, pinned source images. Coordinates
// are normalized for rendering; they do not represent measured cable lengths.
export const EQUIPMENT_TEMPLATES: readonly EquipmentTemplate[] = [
  {
    id: 'netbox-generic-copper-24', name: 'Generic 24-port copper patch panel', kind: 'patch-panel', portCount: 24, heightU: 1,
    imageSrc: '/equipment/netbox/generic-24-port-copper-patch-panel.front.png', imageWidth: 1462, imageHeight: 134,
    description: 'Ports 1–24 run left to right. Ports 1–12 route left; 13–24 route right.',
    ports: patchCenters.map(x => ({ x: x / 1462, y: 65 / 134, width: 44 / 1462, height: 34 / 134 })),
  },
  {
    id: 'netbox-ubiquiti-us-48', name: 'Ubiquiti US-48 · 48 copper ports', kind: 'switch', portCount: 48, heightU: 1,
    imageSrc: '/equipment/netbox/ubiquiti-unifi-switch-48-gen1.front.png', imageWidth: 824, imageHeight: 77,
    description: 'Odd ports are above even ports. Ports 1–24 route left; 25–48 route right. The four pictured SFP/SFP+ uplinks are not editable.',
    ports: Array.from({ length: 48 }, (_, i) => ({ x: switchCenters[Math.floor(i / 2)] / 824, y: (i % 2 === 0 ? 25 : 49) / 77, width: 20 / 824, height: 14 / 77 })),
  },
];
export function findEquipmentTemplate(id: string, custom: readonly EquipmentTemplate[] = []) { return [...EQUIPMENT_TEMPLATES, ...custom].find(template => template.id === id); }
export function compatibleTemplate(equipment: Pick<Equipment, 'kind' | 'portCount' | 'heightU'>, template: EquipmentTemplate) {
  return equipment.kind === template.kind && equipment.portCount === template.portCount && equipment.heightU === template.heightU;
}
export function equipmentTemplate(equipment: Equipment, custom: readonly EquipmentTemplate[] = []): EquipmentTemplate | undefined {
  const template = equipment.templateId ? findEquipmentTemplate(equipment.templateId, custom) : undefined;
  return template && compatibleTemplate(equipment, template) ? template : undefined;
}
export function templatePort(equipment: Equipment, port: number, custom: readonly EquipmentTemplate[] = []) { return equipmentTemplate(equipment, custom)?.ports[port - (equipment.portStart ?? 1)]; }

export function portFace(equipment: Equipment, port: number, custom: readonly EquipmentTemplate[] = []): EquipmentSide { return templatePort(equipment, port, custom)?.face ?? 'front'; }

// Display labels are independent of the numeric keys used by saved connections.
export function interfacePortLabel(name: string): string {
  if (/^mgmt$/i.test(name)) return 'MGMT';
  if (/^console$/i.test(name)) return 'Console';
  return name.replace(/^port\s*(\d+)$/i, '$1');
}
export function templatePortLabel(port: Pick<TemplatePort, 'name' | 'label'>, kind: EquipmentKind, number: number): string {
  return kind === 'switch' ? port.label?.trim() || interfacePortLabel(port.name ?? '') || String(number) : String(number);
}
