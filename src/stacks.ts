import { addEquipment, nextEquipmentId, placementError, resolveEquipment, removeEmptyStacks, type EquipmentPlacement, type Layout, type SwitchStack } from './model';
import { findEquipmentTemplate } from './equipmentTemplates';

export const MAX_STACK_MEMBER = 255;
export const MAX_STACK_CREATE = 100;
export interface StackPlacement extends EquipmentPlacement { member: number }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validMember = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STACK_MEMBER;

// Also called by project import: validate optional stack records rather than trusting JSON types.
export function assertStackLayout(layout: Layout): void {
  if (layout.stacks !== undefined && !Array.isArray(layout.stacks)) throw new Error('Invalid stack list.');
  const ids = new Set<string>(), names = new Set<string>();
  for (const stack of layout.stacks ?? []) {
    if (!object(stack) || typeof stack.id !== 'string' || !/^[\w-]{1,100}$/.test(stack.id)
      || typeof stack.name !== 'string' || !stack.name.trim() || stack.name.length > 100
      || typeof stack.managementAddress !== 'string' || stack.managementAddress.length > 255
      || !['juniper', 'cisco', 'template'].includes(stack.interfaceNaming)) throw new Error('Enter a stack name and valid interface naming option.');
    if (ids.has(stack.id) || names.has(stack.name.trim().toLowerCase())) throw new Error('Use a unique stack name within this distribution frame.');
    ids.add(stack.id); names.add(stack.name.trim().toLowerCase());
  }
  const members = new Set<string>();
  for (const rack of layout.racks) for (const equipment of rack.equipment) {
    const membership = equipment.stack;
    if (membership === undefined) continue;
    if (!object(membership) || equipment.kind !== 'switch' || !ids.has(membership.stackId) || !validMember(membership.member)) throw new Error(`Choose an existing stack and a member number from 0 to ${MAX_STACK_MEMBER} for a switch.`);
    const key = `${membership.stackId}/${membership.member}`;
    if (members.has(key)) throw new Error(`Member ${membership.member} is already assigned in this stack.`);
    members.add(key);
  }
}
export function saveStack(layout: Layout, stack: SwitchStack): Layout {
  const saved = { ...stack, name: stack.name.trim(), managementAddress: stack.managementAddress.trim() };
  const collisions = (layout.stacks ?? []).filter(s => s.id !== saved.id && s.name.trim().toLowerCase() === saved.name.toLowerCase());
  const collisionIds = new Set(collisions.map(s => s.id));
  const members = layout.racks.flatMap(r => r.equipment.filter(e => e.stack && collisionIds.has(e.stack.stackId)).map(e => `${r.label} / ${e.label}`));
  if (members.length) throw new Error(`Stack "${saved.name}" is already used by ${members.slice(0, 3).join(', ')}${members.length > 3 ? ` and ${members.length - 3} more` : ''}. Join that stack or choose another name.`);
  // Older projects can contain empty groups left behind by deleted equipment.
  // Reclaim only their names here; never replace a group that still has members.
  const stacks = (layout.stacks ?? []).filter(s => !collisionIds.has(s.id));
  const next = { ...layout, stacks: stacks.some(s => s.id === stack.id) ? stacks.map(s => s.id === stack.id ? saved : s) : [...stacks, saved] };
  assertStackLayout(next);
  return next;
}
export function nextStackMember(layout: Layout, stackId: string): number {
  const used = new Set(layout.racks.flatMap(r => r.equipment.filter(e => e.stack?.stackId === stackId).map(e => e.stack!.member)));
  for (let member = 0; member <= MAX_STACK_MEMBER; member++) if (!used.has(member)) return member;
  throw new Error('This stack has no unused member numbers.');
}
export function setEquipmentStack(layout: Layout, rackId: string, equipmentId: string, stackId: string | null, member = 0): Layout {
  const { equipment } = resolveEquipment(layout, rackId, equipmentId);
  if (equipment.kind !== 'switch') throw new Error('Only switches can belong to a stack.');
  const updated = { ...equipment };
  if (stackId === null) delete updated.stack;
  else updated.stack = { stackId, member };
  const next = removeEmptyStacks({ ...layout, racks: layout.racks.map(r => r.id !== rackId ? r : { ...r, equipment: r.equipment.map(e => e.id === equipmentId ? updated : e) }) });
  assertStackLayout(next);
  return next;
}
export function createStackEquipment(layout: Layout, stack: SwitchStack, members: StackPlacement[]): Layout {
  if (layout.stacks?.some(s => s.id === stack.id)) throw new Error('Choose a new stack.');
  if (!members.length || members.length > MAX_STACK_CREATE) throw new Error(`Create between 1 and ${MAX_STACK_CREATE} members at a time.`);
  let next = saveStack(layout, stack);
  // All operations return new objects. Any failed row leaves the original layout untouched.
  for (const member of members) {
    try {
      if (findEquipmentTemplate(member.templateId, layout.templates)?.kind !== 'switch') throw new Error('Every stack member must use a switch template.');
      next = addEquipment(next, member);
      next = setEquipmentStack(next, member.rackId, member.id, stack.id, member.member);
    } catch (e) { throw new Error(`Member ${member.member} (${member.label}): ${(e as Error).message}`); }
  }
  return next;
}
export function planStackMembers(layout: Layout, first: EquipmentPlacement, count: number, start: number): StackPlacement[] {
  const template = findEquipmentTemplate(first.templateId, layout.templates);
  if (!template || template.kind !== 'switch') throw new Error('Choose a switch template.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_STACK_CREATE) throw new Error(`Choose 1–${MAX_STACK_CREATE} members.`);
  if (!validMember(start) || !validMember(start + count - 1)) throw new Error(`Member numbers must stay between 0 and ${MAX_STACK_MEMBER}.`);
  const rack = layout.racks.find(r => r.id === first.rackId);
  if (!rack) throw new Error('Choose a rack for the first member.');
  let reserved = layout, ceiling = first.bottomU;
  const rows: StackPlacement[] = [];
  // Accept either a base name or the already-numbered first member name.
  const suffix = `-${start}`;
  const baseName = first.label.trim().endsWith(suffix) ? first.label.trim().slice(0, -suffix.length) : first.label.trim();
  const usedIds = new Set(layout.racks.flatMap(r => r.equipment.map(e => e.id)));
  usedIds.add(first.id);
  for (let index = 0; index < count; index++) {
    let bottomU = index === 0 ? first.bottomU : 0;
    if (index > 0) for (let unit = ceiling - template.heightU; unit >= 1; unit--) {
      if (!placementError(reserved.racks.find(r => r.id === rack.id)!, unit, template.heightU)) { bottomU = unit; break; }
    }
    let id = first.id;
    if (index > 0) {
      id = nextEquipmentId(reserved, 'switch');
      let suffix = 1;
      while (usedIds.has(id)) id = `SW-${String(suffix++).padStart(3, '0')}`;
      usedIds.add(id);
    }
    const row: StackPlacement = { ...first, id, bottomU, member: start + index, label: `${baseName}-${start + index}` };
    rows.push(row); ceiling = bottomU;
    try { reserved = addEquipment(reserved, row); } catch { /* Keep invalid rows visible so the preview can be corrected. */ }
  }
  return rows;
}
