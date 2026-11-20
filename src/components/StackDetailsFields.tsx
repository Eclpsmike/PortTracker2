import type { SwitchStack } from '../model';

export function StackDetailsFields({ value, onChange }: { value: SwitchStack; onChange: (stack: SwitchStack) => void }) {
  return <div className="stack-details-fields">
    <label>Stack name<input required maxLength={100} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })}/></label>
    <label>Management address (optional)<input maxLength={255} value={value.managementAddress} placeholder="IP address or hostname" onChange={e => onChange({ ...value, managementAddress: e.target.value })}/></label>
    <label>Interface naming<select value={value.interfaceNaming} onChange={e => onChange({ ...value, interfaceNaming: e.target.value as SwitchStack['interfaceNaming'] })}><option value="juniper">Juniper Virtual Chassis</option><option value="cisco">Cisco StackWise</option><option value="template">Keep template interface names</option></select></label>
    <p className="note">{value.interfaceNaming === 'cisco'
      ? 'Cisco naming adjusts the member in mapped names such as GigabitEthernet1/0/1. The interface type, slot, and port stay unchanged. Other interface names are preserved.'
      : value.interfaceNaming === 'juniper'
        ? 'Juniper naming adjusts the member in mapped names such as ge-0/0/23. The interface type, PIC, and port stay unchanged. Other interface names are preserved.'
        : 'Template interface names remain unchanged for every stack member.'}</p>
  </div>;
}
