import { useId, useMemo, useState } from 'react';
import type { Layout } from '../model';
import { searchRacks, type RackSearchTarget } from '../rackSearch';
import { Icon } from './Icon';

export function RackSearch({ layout, frameName, portPrefix, onSelect }: {
  layout: Layout; frameName: string; portPrefix?: string; onSelect: (target: RackSearchTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const id = useId();
  const results = useMemo(() => searchRacks(layout, query, portPrefix), [layout.racks, layout.cables, layout.portDetails, layout.templates, layout.stacks, query, portPrefix]);
  function select(target: RackSearchTarget) { onSelect(target);setQuery(''); }
  return <section className="rack-search panel" aria-label="Search rack workspace">
    <label htmlFor={id} title={`Search equipment, ports and connections in ${frameName}`}>Search</label>
    <div className="rack-search-field"><Icon name="search" size={15}/><input id={id} type="search" aria-label="Search rack workspace" placeholder="Equipment, ports, locations…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation();setQuery(''); }
      else if (event.key === 'Enter' && results.length) { event.preventDefault();select(results[0].target); }
    }}/>{query && <button type="button" aria-label="Clear rack search" onClick={() => setQuery('')}><Icon name="close" size={13}/></button>}</div>
    {query.trim() && <><p role="status">{results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'}${results.length > 50 ? ' · Showing first 50' : ''}` : 'No matching items'}</p>
      <ul className="rack-search-results">{results.slice(0, 50).map(result => <li key={result.key}><button type="button" data-search-result={result.key} onClick={() => select(result.target)}><strong>{result.title}</strong><span>{result.description}</span><small>{result.target.kind === 'equipment' ? 'Equipment' : result.target.kind === 'port' ? 'Port' : 'Connection'}</small></button></li>)}</ul>
    </>}
  </section>;
}
