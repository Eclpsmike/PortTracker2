import { FIBER_CONNECTORS, PORT_KINDS, type PortMedia, type PortKind, type FiberCable, type FiberMode, isSlot, portMedium } from '../media';
export function PortMediaFields({ value, onChange }: { value: PortMedia; onChange: (value: PortMedia) => void }) {
  return <div className="media-fields">
    <label>Port type<select value={value.kind} onChange={e => onChange({ kind: e.target.value as PortKind })}>{Object.entries(PORT_KINDS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
    {value.kind !== 'copper' && <>
      {isSlot(value) && <label>Installed transceiver<input maxLength={200} value={value.transceiver ?? ''} placeholder="Model / part number" onChange={e => onChange({ ...value, transceiver: e.target.value })}/></label>}
      <label>Port connector<select value={value.connector ?? ''} onChange={e => {
        const connector = e.target.value as PortMedia['connector'];
        onChange(connector === 'RJ45' ? { kind: value.kind, transceiver: value.transceiver, connector } : { ...value, connector: connector || undefined });
      }}><option value="">Choose connector</option>{FIBER_CONNECTORS.map(c => <option key={c}>{c}</option>)}{isSlot(value) && <option>RJ45</option>}</select></label>
      {portMedium(value) === 'fiber' && <>
        <label>Port fiber mode<select value={value.mode ?? ''} onChange={e => onChange({ ...value, mode: e.target.value as FiberMode || undefined })}><option value="">Choose mode</option><option value="single-mode">Single-mode</option><option value="multimode">Multimode</option></select></label>
        <label>Port strand count<input type="number" min={1} max={144} step={1} value={value.strands ?? ''} onChange={e => onChange({ ...value, strands: e.target.value === '' ? undefined : e.target.valueAsNumber })}/></label>
      </>}
    </>}
  </div>;
}
export function FiberFields({ value, onChange }: { value: FiberCable; onChange: (value: FiberCable) => void }) {
  return <div className="media-fields">
    <label>Fiber mode<select value={value.mode} onChange={e => onChange({ ...value, mode: e.target.value as FiberMode })}><option value="single-mode">Single-mode</option><option value="multimode">Multimode</option></select></label>
    <label>From connector<select value={value.fromConnector} onChange={e => onChange({ ...value, fromConnector: e.target.value as FiberCable['fromConnector'] })}>{FIBER_CONNECTORS.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>To connector<select value={value.toConnector} onChange={e => onChange({ ...value, toConnector: e.target.value as FiberCable['toConnector'] })}>{FIBER_CONNECTORS.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Fiber strand count<input type="number" min={1} max={144} step={1} required value={Number.isNaN(value.strands) ? '' : value.strands} onChange={e => onChange({ ...value, strands: e.target.valueAsNumber })}/></label>
  </div>;
}
