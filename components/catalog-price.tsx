'use client';
import {useId,useState} from 'react';

const amountPattern=/^\$?(?:[0-9]+(?:\.[0-9]{0,2})?|\.[0-9]{1,2})$/;
export function retailAmountToCents(text:string):number|null|undefined{
 const amount=text.trim();
 if(!amount)return null;
 if(!amountPattern.test(amount))return undefined;
 const [whole,fraction='']=amount.replace(/^\$/,'').split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents<=1000000000?cents:undefined;
}
export function CatalogPrice({value,onChange}:{value:number|null;onChange:(value:number|null)=>void}){
 const id=useId(),[text,setText]=useState(value===null?'':(value/100).toFixed(2));
 return <label htmlFor={id}>Original Retail Price<input id={id} type="text" inputMode="decimal" maxLength={32} placeholder="11.25" value={text} aria-describedby={id+'-help'} onChange={event=>{
  const next=event.target.value,cents=retailAmountToCents(next);
  setText(next);
  event.target.setCustomValidity(cents===undefined?'Enter an amount from 0 to 10000000 with up to two decimal places, such as 11.25.': '');
  if(cents!==undefined)onChange(cents);
 }} onBlur={()=>{const cents=retailAmountToCents(text);if(cents!==undefined)setText(cents===null?'':(cents/100).toFixed(2));}}/><small id={id+'-help'}>Enter dollars and cents, e.g. 11.25. Uses the selected Retail Currency.</small></label>;
}
