import { type Layout, type Endpoint, equipmentUnits, interfaceName, firstPortNumber, portNumbers } from '../model';
export function EndpointPicker({ layout, value, onChange, label, ports = true }: { layout: Layout; value: Endpoint; onChange: (value: Endpoint) => void; label: string; ports?: boolean }) {
  const populated = layout.racks.filter(r => r.equipment.length);
  const rack = populated.find(r => r.id === value.rackId) ?? populated[0];
  const equipment = rack?.equipment.find(e => e.id === value.equipmentId) ?? rack?.equipment[0];
  if (!rack || !equipment) return <p className="note">Add equipment to a rack before selecting ports.</p>;
  return <fieldset className="endpoint-picker"><legend>{label}</legend>
    <label>Rack<select aria-label={`${label} rack`} value={rack.id} onChange={ev => { const r = populated.find(r => r.id === ev.target.value)!; onChange({ rackId: r.id, equipmentId: r.equipment[0].id, port: firstPortNumber(r.equipment[0]) }); }}>{layout.racks.map(r => <option key={r.id} value={r.id} disabled={!r.equipment.length}>{r.label}{r.equipment.length ? '' : ' (empty)'}</option>)}</select></label>
    <label>Equipment<select aria-label={`${label} equipment`} value={equipment.id} onChange={ev => onChange({ rackId: rack.id, equipmentId: ev.target.value, port: firstPortNumber(rack.equipment.find(e => e.id === ev.target.value)!) })}>{rack.equipment.map(e => <option key={e.id} value={e.id}>{e.label} · {e.portCount}-port {e.kind === 'switch' ? 'switch' : 'panel'} · {equipmentUnits(e)}</option>)}</select></label>
    {ports && <label>Port<select aria-label={`${label} port`} value={value.port} onChange={ev => onChange({ rackId: rack.id, equipmentId: equipment.id, port: +ev.target.value })}>{portNumbers(equipment).map(port => { const name = interfaceName(layout, equipment, port); return <option key={port} value={port}>Port {port}{name ? ` · ${name}` : ''}</option>; })}</select></label>}
  </fieldset>;
}
