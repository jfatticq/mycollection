'use client';
import {useId,useState} from 'react';
import {RemoveIconButton} from '@/components/remove-icon-button';
export function CatalogTaxonomyPicker({terms,selected,onChange}:{terms:any[];selected:string[];onChange:(ids:string[])=>void}) {
 const id=useId(),[query,setQuery]=useState('');
 const available=terms.filter(term=>term.kind!=='faction'&&!selected.includes(term.id)&&(`${term.kind} ${term.name}`).toLowerCase().includes(query.toLowerCase()));
 return <details className="taxonomy-picker"><summary>Other taxonomy associations ({selected.length})</summary><ul className="faction-chip-list">{selected.map(key=>{const term=terms.find(term=>term.id===key);return <li className="removable-chip" key={key}><span>{term?`${term.kind}: ${term.name}`:'Unknown association'}</span><RemoveIconButton label={'Remove association '+(term?.name??key)} onClick={()=>onChange(selected.filter(value=>value!==key))}/></li>;})}</ul><label htmlFor={id}>Search taxonomy</label><input id={id} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search names or types…"/><ul className="taxonomy-results">{available.map(term=><li key={term.id}><button type="button" onClick={()=>onChange([...selected,term.id])}>Add {term.kind.replaceAll('_',' ')}: {term.name}</button></li>)}</ul>{!available.length&&<p>No matching unselected terms.</p>}</details>;
}
