import { useEffect, useId, useState } from 'react';

export function EquipmentLabelControl({ label, onSave }: { label: string; onSave: (label: string) => void }) {
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState('');
  const errorId = useId();
  useEffect(() => { setDraft(label); setError(''); }, [label]);

  function save() {
    const value = draft.trim();
    if (!value) { setError('Enter a label name.'); return; }
    setError('');
    setDraft(value);
    if (value !== label) onSave(value);
  }

  return <div className="equipment-label-control">
    <label>Label name<input type="text" value={draft} maxLength={100}
      title="Saves when you leave the field or press Enter. Press Escape to cancel."
      aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
      onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={save}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); save(); }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(label); setError(''); }
      }}/></label>
    {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
  </div>;
}
