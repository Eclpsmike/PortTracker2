import { equipmentStack, estimateCable, interfaceName, patchPortDetails, portVlan, resolveEndpoint, type Endpoint, type Layout } from './model';
import { fiberLabel } from './media';
import { projectLayout, type Project } from './project';
import { cableLengthUnitSymbol, formatCableLengthValue, type LengthUnit } from './units';

export function connectionRows(project: Project) {
  const vlanName = (id: number | null) => id === null ? 'Unassigned' : `${id} — ${project.configuration.vlans.find(v => v.id === id)?.name ?? 'Unknown VLAN'}`;
  const endpoint = (layout: Layout, ep: Endpoint) => {
    const { rack, equipment } = resolveEndpoint(layout, ep);
    return { rackId: rack.id, rack: rack.label, equipment: equipment.label, port: ep.port,
      stackId: equipment.stack?.stackId ?? '', stack: equipmentStack(layout, equipment)?.name ?? '', member: equipment.stack?.member ?? null,
      interfaceName: interfaceName(layout, equipment, ep.port),
      label: `${rack.label} / ${equipment.label} / Port ${ep.port}`, vlan: vlanName(portVlan(layout, ep)), ...patchPortDetails(layout, ep) };
  };
  return project.locations.flatMap(frame => {
    const layout = projectLayout(project, frame.id);
    const calibration = { ...frame.calibration, stockedLengthsM: project.configuration.stockedLengthsM, fiberStock: project.configuration.fiberStock };
    return layout.cables.map(cable => {
      const estimate = estimateCable(layout, cable, calibration);
      return { key: `${frame.id}/${cable.id}`, frameId: frame.id, frame: frame.name, archived: frame.archived,
        building: project.buildings.find(b => b.id === frame.buildingId)?.name ?? '',
        from: endpoint(layout, cable.from), to: endpoint(layout, cable.to),
        vlanId: cable.vlan, vlan: vlanName(cable.vlan), medium: cable.medium ?? 'copper',
        media: cable.medium === 'fiber' ? `Fiber${cable.fiber ? ` · ${fiberLabel(cable.fiber)}` : ''}` : 'Copper',
        jacket: cable.jacket, route: estimate.overhead ? 'Overhead' : 'Side manager',
        estimated: estimate.requiredM, stock: estimate.recommendedM };
    });
  });
}
export type ConnectionRow = ReturnType<typeof connectionRows>[number];

// Quote every field, preserve multiline notes, and keep spreadsheet formulas inert.
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function dataCsv(headers: string[], values: (string | number)[][]) {
  return '\uFEFF' + [headers, ...values].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function connectionsCsv(rows: ConnectionRow[], unit: LengthUnit) {
  const symbol = cableLengthUnitSymbol(unit);
  const headers = ['Building', 'Distribution frame', 'Archived', 'From rack', 'From equipment', 'From port', 'From port VLAN', 'From location', 'From notes',
    'To rack', 'To equipment', 'To port', 'To port VLAN', 'To location', 'To notes', 'Cable VLAN', 'Cable type', 'Jacket color', 'Route', `Estimated length (${symbol})`, `Stock length (${symbol})`,
    'From stack', 'From member', 'From interface', 'To stack', 'To member', 'To interface'];
  const values = rows.map(row => [row.building, row.frame, row.archived ? 'Yes' : 'No',
    row.from.rack, row.from.equipment, row.from.port, row.from.vlan, row.from.facilityLocation, row.from.notes,
    row.to.rack, row.to.equipment, row.to.port, row.to.vlan, row.to.facilityLocation, row.to.notes,
    row.vlan, row.media, row.jacket, row.route, formatCableLengthValue(row.estimated, unit), row.stock === null ? 'No matching stock' : formatCableLengthValue(row.stock, unit),
    row.from.stack, row.from.member ?? '', row.from.interfaceName, row.to.stack, row.to.member ?? '', row.to.interfaceName]);
  return dataCsv(headers, values);
}
