import { useState } from 'react';
import { cableColorError, configuredCableColors, configuredDefaultCableColor, type CableColor, type Configuration } from '../configuration';

export function CableColorsSection({ configuration, onChange, onDefaultChange }: { configuration: Configuration; onChange: (colors: CableColor[], defaultColor?: string) => void; onDefaultChange: (color: string) => void }) {
  const colors = configuredCableColors(configuration);
  const defaultColor = configuredDefaultCableColor(configuration);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CableColor>({ name: '', color: '#159de7' });
  const [error, setError] = useState('');
  function reset() { setEditing(null);setDraft({ name: '', color: '#159de7' });setError(''); }
  return <section className="panel configuration-table-panel cable-colors-section" aria-label="Cable colors">
    <div className="configuration-table-toolbar"><h2>Cable colors</h2></div>
    <p className="note">Available jacket colors for connections. Colors used by configured fiber stock remain available.</p>
    <label className="default-cable-color">Default cable color<select disabled={!colors.length} value={defaultColor} onChange={event => onDefaultChange(event.target.value)}>
      {!colors.length && <option value="">No colors configured</option>}
      {colors.map(value => <option key={value.color} value={value.color}>{value.name}</option>)}
    </select></label>
    <div className="configuration-table-scroll"><table className="configuration-table"><caption className="sr-only">Configured cable colors</caption><thead><tr><th>Name</th><th>Color</th><th>Actions</th></tr></thead><tbody>
      {colors.map(value => <tr key={value.color}><td>{value.name}</td><td><span className="swatch" style={{ background: value.color }}/>{value.color}</td><td><div className="config-actions">
        <button type="button" className="secondary-button" aria-label={`Edit cable color ${value.name}`} onClick={() => { setEditing(value.color);setDraft(value);setError(''); }}>Edit</button>
        <button type="button" className="secondary-button" aria-label={`Remove cable color ${value.name}`} disabled={value.color === defaultColor || configuration.fiberStock?.some(stock => stock.jacket.toLowerCase() === value.color)} title={value.color === defaultColor ? 'Choose another default color before removing this color' : 'Colors used by fiber stock must be changed in fiber stock first'} onClick={() => { onChange(colors.filter(color => color.color !== value.color));if (editing === value.color) reset(); }}>Remove</button>
      </div></td></tr>)}
      {!colors.length && <tr><td colSpan={3}>No cable colors configured.</td></tr>}
    </tbody></table></div>
    <form className="cable-color-form" onSubmit={event => {
      event.preventDefault();
      const problem = cableColorError(draft, colors, editing ?? undefined);
      if (problem) { setError(problem);return; }
      onChange([...colors.filter(color => color.color !== editing), { name: draft.name.trim(), color: draft.color.toLowerCase() }], editing === defaultColor ? draft.color.toLowerCase() : undefined);reset();
    }}>
      <label>Color name<input type="text" required maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
      <label>Jacket color<input type="color" value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })}/></label>
      <button className="primary-button" type="submit">{editing ? 'Save cable color' : 'Add cable color'}</button>
      {editing && <button className="secondary-button" type="button" onClick={reset}>Cancel</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </section>;
}
