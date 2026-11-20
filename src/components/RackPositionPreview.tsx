import { useEffect, useRef } from 'react';
import { equipmentTopU, equipmentUnits, type Rack } from '../model';

export function RackPositionPreview({ rack, bottomU, heightU, excludeId, onSelect, firstOnly = false }: {
  rack: Rack; bottomU: number; heightU: number; excludeId?: string;
  onSelect: (unit: number) => void; firstOnly?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const occupied = new Map<number, string>();
  for (const e of rack.equipment.filter(e => e.id !== excludeId)) {
    for (let u = e.bottomU; u <= equipmentTopU(e); u++) occupied.set(u, e.label);
  }
  const validNumber = Number.isInteger(bottomU);
  const topU = bottomU + heightU - 1;
  const outOfBounds = !validNumber || bottomU < 1 || topU > rack.heightU;
  const overlaps = validNumber && [...occupied.keys()].some(u => u >= bottomU && u <= topU);
  const invalid = outOfBounds || overlaps;
  useEffect(() => {
    const container = viewport.current;
    if (!container || !Number.isInteger(bottomU)) return;
    const target = container.querySelector<HTMLElement>(`[data-unit="${Math.min(rack.heightU, Math.max(1, bottomU))}"]`);
    if (!target) return;
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    if (offset < 0 || offset + target.offsetHeight > container.clientHeight) container.scrollTop += offset - container.clientHeight / 2;
  }, [rack.id, bottomU, heightU, rack.heightU]);
  return <section className="rack-position-preview" aria-label="Rack position preview">
    <div className="rack-position-heading"><strong>{rack.label} · {rack.heightU}U</strong><span>{occupied.size}U used · {rack.heightU - occupied.size}U free{excludeId ? ' (excluding moving device)' : ''}</span></div>
    <p className="note">Click a unit to set the bottom position. {heightU}U equipment extends upward.{firstOnly ? ' This shows the first device; review all placements in the batch preview.' : ''}</p>
    <div className="rack-position-legend"><span>Free</span><span className="occupied">Occupied</span><span className="proposed">Proposed</span><span className="conflict">Conflict</span></div>
    <div ref={viewport} className="rack-position-units" role="group" aria-label="Rack units, highest to lowest">
      {Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i).map(unit => {
        const occupant = occupied.get(unit);
        const selected = validNumber && unit >= bottomU && unit <= topU;
        const state = selected ? invalid ? 'conflict' : 'proposed' : occupant ? 'occupied' : 'free';
        return <button type="button" key={unit} data-unit={unit} className={state} aria-pressed={selected}
          aria-label={`U${unit}: ${occupant ? `Occupied by ${occupant}` : 'Free'}${selected ? invalid ? ', placement conflict' : ', proposed placement' : ''}`}
          onClick={() => onSelect(unit)}>
          <b>U{unit}</b><span>{occupant ?? 'Free'}</span><small>{selected ? invalid ? 'Conflict' : 'Proposed' : occupant ? 'Occupied' : ''}</small>
        </button>;
      })}
    </div>
    <p className={invalid ? 'form-error' : 'note'} role="status">{validNumber ? `${firstOnly ? 'First device' : 'Proposed placement'}: ${equipmentUnits({ bottomU, heightU })}.` : 'Enter a whole bottom rack unit.'}{outOfBounds && validNumber ? ` Must fit within U1–U${rack.heightU}.` : overlaps ? ' Overlaps installed equipment.' : ''}</p>
  </section>;
}
