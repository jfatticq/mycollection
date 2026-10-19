'use client';
import {useId,useState} from 'react';
import {FieldGuidance} from '@/components/field-guidance';
type Choice = {value:string;label:string};
export const scaleChoices:Choice[]=['1:6','1:12','1:18','1:24','1:32','1:64'].map(value=>({value,label:value}));
export const marketChoices:Choice[]=['United States','Canada','United Kingdom','Japan','China','Hong Kong','Taiwan','India','Australia','New Zealand','Brazil','Argentina','Mexico','France','Germany','Italy','Spain','Netherlands','South Africa','Singapore','Europe','North America','Latin America','Asia','Worldwide'].map(value=>({value,label:value}));
export const currencyChoices:Choice[]=[{value:'USD',label:'USD — US Dollar'},{value:'CAD',label:'CAD — Canadian Dollar'},{value:'EUR',label:'EUR — Euro'},{value:'GBP',label:'GBP — Pound Sterling'},{value:'AUD',label:'AUD — Australian Dollar'},{value:'JPY',label:'JPY — Japanese Yen'},{value:'MXN',label:'MXN — Mexican Peso'},{value:'BRL',label:'BRL — Brazilian Real'},{value:'CNY',label:'CNY — Chinese Yuan'},{value:'HKD',label:'HKD — Hong Kong Dollar'}];
export function CatalogChoice({label,value,choices,onChange,currency=false,guidance,customPlaceholder,customHelp}:{label:string;value:string|null;choices:Choice[];onChange:(value:string|null)=>void;currency?:boolean;guidance?:string;customPlaceholder?:string;customHelp?:string}){
 const controlId=useId(),[custom,setCustom]=useState(value!==null&&!choices.some(c=>c.value===value));
 return <div className="catalog-choice"><div className="catalog-choice-heading"><label htmlFor={controlId}>{label}</label>{guidance&&<FieldGuidance label={label} text={guidance}/>}</div><select id={controlId} value={custom?'__custom__':value??''} onChange={e=>{if(e.target.value==='__custom__'){setCustom(true);onChange(null);}else{setCustom(false);onChange(e.target.value||null);}}}><option value="">Unknown</option>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}<option value="__custom__">Other…</option></select>{custom&&<><label htmlFor={controlId+'-custom'}>Custom {label}<input id={controlId+'-custom'} required maxLength={currency?3:200} pattern={currency?'[A-Z]{3}':undefined} placeholder={customPlaceholder??(currency?'Three-letter code, e.g. NZD':'Enter a scale')} value={value??''} aria-describedby={controlId+'-help'} onChange={e=>onChange((currency?e.target.value.toUpperCase():e.target.value)||null)}/></label><small id={controlId+'-help'}>{customHelp??(currency?'Use a three-letter currency code.':'Enter a ratio or another scale description.')}</small></>}</div>;
}
export function CatalogYear({value,onChange}:{value:number|null;onChange:(value:number|null)=>void}){
 const newest=new Date().getUTCFullYear()+2;
 const years=Array.from({length:newest-1960+1},(_,i)=>newest-i);
 if(value!==null&&!years.includes(value))years.push(value);
 years.sort((a,b)=>b-a);
 return <label>Year<select value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}><option value="">Unknown</option>{years.map(year=><option key={year} value={year}>{year}</option>)}</select></label>;
}
