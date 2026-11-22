import { useState } from 'react';
import type { Project } from '../project';
import { Icon } from '../components/Icon';
import { effectiveLocationId, kindLabels, objectVisible, type FloorFilters, type FloorObject, type FloorPlan } from './model';
import { facilityPortLabel } from './portLabels';

export function FloorSearch({plan,project,filters,onSelect}:{plan:FloorPlan;project:Project;filters:FloorFilters;onSelect:(object:FloorObject)=>void}) {
  const [query,setQuery]=useState('');
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results=terms.length?plan.objects.flatMap(object=>{
    const location=plan.objects.find(o=>o.id===effectiveLocationId(plan,object))?.name;
    const ports=(object.ports??[]).map(port=>facilityPortLabel(port,project));
    const frames=project.locations.filter(frame=>frame.id===object.idfId||object.ports?.some(port=>port.idfId===frame.id));
    const text=[object.name,object.id,kindLabels[object.kind],object.notes,location,...ports,...(object.ports??[]).map(p=>p.label),...frames.flatMap(frame=>[frame.name,frame.portPrefix])].join(' ').toLowerCase();
    return terms.every(term=>text.includes(term))?[{object,location,ports,hidden:!objectVisible(plan,object,filters)}]:[];
  }):[];
  return <section className="floor-search" aria-label="Search floor plan">
    <label htmlFor="floor-object-search">Search</label>
    <div className="floor-search-field"><Icon name="search" size={15}/><input id="floor-object-search" type="search" placeholder="Items, ports, rooms or IDFs…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setQuery('');}else if(event.key==='Enter'&&results.length===1){event.preventDefault();onSelect(results[0].object);}}}/>{query&&<button type="button" aria-label="Clear floor search" onClick={()=>setQuery('')}><Icon name="close" size={13}/></button>}</div>
    {terms.length>0&&<><p role="status">{results.length?`${results.length} ${results.length===1?'item':'items'} found`:'No matching items'}</p><ul className="floor-search-results">{results.map(({object,location,ports,hidden})=><li key={object.id}><button type="button" onClick={()=>onSelect(object)} title={hidden?'Show on plan and open properties':'Center on plan and open properties'}><strong>{object.name}</strong><span>{kindLabels[object.kind]}{location?` · ${location}`:''}{hidden?' · Hidden':''}</span>{ports.length>0&&<small>{ports.join(', ')}</small>}</button></li>)}</ul></>}
  </section>;
}
