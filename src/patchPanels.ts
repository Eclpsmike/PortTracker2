import { addEquipment, nextEquipmentId, placementError, type EquipmentPlacement, type Layout } from './model';
import { findEquipmentTemplate } from './equipmentTemplates';
import { MAX_PORT_NUMBER, validPortRange } from './portNumbering';

export const MAX_PANEL_BATCH = 100;
export function planPatchPanels(layout: Layout, first: EquipmentPlacement, quantity: number, start: number): EquipmentPlacement[] {
  const template = findEquipmentTemplate(first.templateId, layout.templates);
  if (!template || template.kind !== 'patch-panel') throw new Error('Choose a patch-panel template.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PANEL_BATCH) throw new Error(`Choose 1–${MAX_PANEL_BATCH} panels.`);
  if (!validPortRange(start, template.portCount) || start + quantity * template.portCount - 1 > MAX_PORT_NUMBER) throw new Error(`Port numbers must stay between 0 and ${MAX_PORT_NUMBER}.`);
  if (!layout.racks.some(r => r.id === first.rackId)) throw new Error('Choose a rack.');
  let reserved = layout, ceiling = first.bottomU;
  const used = new Set(layout.racks.flatMap(r => r.equipment.map(e => e.id)));
  used.add(first.id);
  const rows: EquipmentPlacement[] = [];
  for (let i = 0; i < quantity; i++) {
    let bottomU = i === 0 ? first.bottomU : 0;
    if (i > 0) for (let u = ceiling - template.heightU; u >= 1; u--) {
      if (!placementError(reserved.racks.find(r => r.id === first.rackId)!, u, template.heightU)) { bottomU = u; break; }
    }
    let id = first.id;
    if (i > 0) {
      id = nextEquipmentId(reserved, 'patch-panel');
      let suffix = 1;
      while (used.has(id)) id = `PP-${String(suffix++).padStart(3, '0')}`;
      used.add(id);
    }
    const row = { ...first, id, label: i === 0 ? first.label : `${first.label} · Panel ${i + 1}`, bottomU, portStart: start + i * template.portCount };
    rows.push(row); ceiling = bottomU;
    try { reserved = addEquipment(reserved, row); } catch { /* Invalid positions stay visible for correction in the preview. */ }
  }
  return rows;
}

export function createPatchPanels(layout: Layout, rows: EquipmentPlacement[]): Layout {
  if (!rows.length || rows.length > MAX_PANEL_BATCH) throw new Error('Choose a valid panel quantity.');
  return rows.reduce((next, row, i) => {
    try {
      if (findEquipmentTemplate(row.templateId, layout.templates)?.kind !== 'patch-panel') throw new Error('Choose a patch-panel template.');
      return addEquipment(next, row);
    } catch (e) { throw new Error(`Panel ${i + 1}: ${(e as Error).message}`); }
  }, layout);
}
