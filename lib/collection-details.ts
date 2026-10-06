import {ownedForm,identityFor} from './catalog-reliability';
import {canonicalId} from './catalog';
import accessoryLists from '@/lib/accessory-snapshots.json';
export type Piece={id:string;label:string;quantity:number;owned:boolean|null;ownedQuantity?:number|null;catalogKey?:string;expectedQuantity?:number;source?:string;placeholder?:boolean;quantityConfirmed?:boolean};
export type Inventory={pieces:Piece[];source:string;checked?:string;status?:'reviewed'|'partial';note?:string;matchNote?:string};
// New records use one ownership control; legacy checkbox records remain readable.
export function pieceOwnedQuantity(piece:Piece):number|null{
 if(Object.prototype.hasOwnProperty.call(piece,'ownedQuantity'))return piece.ownedQuantity??null;
 return piece.owned===true?piece.quantity:piece.owned===false?0:null;
}
export function setPieceOwnedQuantity(piece:Piece,quantity:number|null):Piece{
 if(quantity!==null&&(!Number.isInteger(quantity)||quantity<0||quantity>999))throw Error('Enter a whole part quantity from 0 to 999, or leave it blank.');
 return {...piece,ownedQuantity:quantity,owned:quantity===null?null:quantity>0};
}
export function piecePresence(piece:Piece){const quantity=pieceOwnedQuantity(piece);return quantity===null?'Not checked':quantity===0?'Missing':piece.expectedQuantity&&quantity<piece.expectedQuantity?'Short of expected quantity':'Present';}
export function defaultPieces(kind='Figure'):Piece[]{return [{id:'main',label:kind==='Figure'?'Figure':kind==='Vehicle / playset'?'Vehicle / playset':'Item',quantity:1,owned:true},{id:'paperwork',label:kind==='Figure'?'File card':kind==='Vehicle / playset'?'Blueprints / instructions':'Paperwork (not verified)',quantity:1,owned:null,placeholder:true}];}
export function knownPieces(releaseId:string):Inventory|undefined{return (accessoryLists as Record<string,Inventory>)[releaseId]||(accessoryLists as Record<string,Inventory>)[canonicalId(releaseId)];}
const pieceKey=(label:string)=>label.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function mergeKnownPieces(existing:Piece[],suggested:Piece[],source?:string):Piece[]{
 const result=existing.map(p=>({...p}));
 for(const expected of suggested){
  const key=pieceKey(expected.label);
  const index=result.findIndex(p=>p.catalogKey===key||pieceKey(p.label)===key||(p.id==='main'&&expected.id==='main'));
  if(index>=0){const current=result[index];result[index]={...current,catalogKey:key,expectedQuantity:expected.quantityConfirmed===false?undefined:expected.quantity,quantityConfirmed:expected.quantityConfirmed,source:source||expected.source,placeholder:false};if(current.id==='main'&&current.label==='Vehicle / playset')result[index].label=expected.label;}
  else result.push({...expected,id:'catalog-'+key.replace(/ /g,'-'),catalogKey:key,expectedQuantity:expected.quantityConfirmed===false?undefined:expected.quantity,quantityConfirmed:expected.quantityConfirmed,source:source||expected.source,ownedQuantity:null,owned:null,placeholder:false});
 }
 return result;
}
export function inventoryStatus(releaseId:string){const list=knownPieces(releaseId);return !list?'unverified':list.status==='reviewed'?'reviewed':'partial';}
export function inventoryLabel(releaseId:string){return {unverified:'Accessory inventory not yet verified',partial:'Partial sourced inventory',reviewed:'Reviewed inventory'}[inventoryStatus(releaseId)];}
export const adjustmentCategories=['Condition','Missing pieces','Packaging status','Box condition'];
export function itemState(item:any){const base=[item.releaseId||'',item.name,item.year,item.line,item.condition,item.completeness,item.packaging,item.packagingCondition||'Not recorded',(item.pieces||[]).map((p:Piece)=>{const quantity=pieceOwnedQuantity(p);return [p.label,quantity===null||quantity===0?p.quantity:quantity,quantity===null?null:quantity>0];})];if(item.ownedForm)base.push(item.ownedForm);return JSON.stringify(base);}
export function matchingSales(item:any){return (item.comps||[]).filter((x:any)=>Number(x.price)>0&&Number.isFinite(Number(x.price))&&x.url&&x.date&&x.confirmed&&x.itemState===itemState(item));}
export function estimateItem(item:any,reference?:any){
 const result=(value:number|null,low:number|null,high:number|null,basis:string,confidence:string,reasons:string[],date:string)=>({value,low,high,basis,confidence,reasons,date});
 const manual=Number(item.estimatedValue);if(item.estimatedValue!==''&&item.estimatedValue!=null&&Number.isFinite(manual)&&manual>=0)return result(manual,manual,manual,'Your estimate','Owner supplied',['Your override takes priority; no extra adjustments applied.'],item.estimateDate||'Not recorded');
 const sales=matchingSales(item);const values=sales.map((x:any)=>Number(x.price)).sort((a:number,b:number)=>a-b);
 if(values.length){const median=values.length%2?values[Math.floor(values.length/2)]:(values[values.length/2-1]+values[values.length/2])/2;return result(median,values[0],values[values.length-1],'Matching sales',values.length>=3?'Moderate':'Low',[`${values.length} sales confirmed for this release, condition, pieces and packaging. Range is observed sale prices; no additional premium or discount applied.`],sales.map((x:any)=>x.date).sort().reverse()[0]);}
 const custom=item.baselinePrice!==''&&item.baselinePrice!=null&&Number.isFinite(Number(item.baselinePrice))&&Number(item.baselinePrice)>0;
 const guide=Number(custom?item.baselinePrice:item.guidePrice??reference?.price);const date=custom?item.baselineDate||'Not recorded':item.guideChecked||reference?.checked||'Not recorded';
 if(!Number.isFinite(guide)||guide<=0)return result(null,null,null,'Unpriced','Unavailable',['Add matching sales, a baseline price, or your own estimate.'],date);
 if(!custom&&(item.identificationStatus==='unidentified'||ownedForm(item,reference)!==identityFor(reference).entityType))return result(null,null,null,'Unpriced','Unavailable',['The guide describes a different product form or an unidentified release. Use matching sales or a reviewed baseline for the item you own.'],date);
 const current=item.adjustmentState===itemState(item);const adjustments=(item.adjustments||[]).filter((x:any)=>x.reason?.trim()&&x.low!==''&&x.high!==''&&Number.isFinite(Number(x.low))&&Number.isFinite(Number(x.high))&&Number(x.low)<=Number(x.high));
 const entered=(item.adjustments||[]).filter((x:any)=>x.low!==''||x.high!==''||x.reason?.trim());
 if(current&&item.baselineForm===ownedForm(item,reference)&&item.baselineCondition?.trim()&&item.baselinePackaging&&item.baselinePackaging!=='Unknown'&&item.adjustmentsReviewed&&adjustments.length&&entered.length===adjustments.length){const low=Math.max(0,guide+adjustments.reduce((n:number,x:any)=>n+Number(x.low),0));const high=Math.max(0,guide+adjustments.reduce((n:number,x:any)=>n+Number(x.high),0));return result((low+high)/2,low,high,'Provisional adjusted estimate','Low',adjustments.map((x:any)=>`${x.category}: ${Number(x.low)>=0?'+':''}$${Number(x.low)} to ${Number(x.high)>=0?'+':''}$${Number(x.high)} — ${x.reason}`),date);}
 return result(null,null,null,'Unpriced reference','Unavailable',[item.adjustmentState&&!current?'Item details changed. Reconfirm sales or review provisional adjustments.':'Guide reference $'+guide.toFixed(2)+' excluded from the collection total until the exact item, condition and packaging baseline are reviewed.',item.baselinePackaging&&item.baselinePackaging!=='Unknown'?`Baseline packaging: ${item.baselinePackaging}. No adjustments applied.`:'Baseline packaging is unknown; no boxed premium applied.'],date);
}
export function parseAccessories(text:string):Piece[]{
 let clause=text.replace(/^.*?came (?:with|equipped with)\s+/i,'').replace(/\.$/,'').trim();
 clause=clause.split(/\.\s+(?=[A-Z])/)[0].replace(/^the following (?:weapons|accessories|equipment)\s*:\s*/i,'');
 if(!clause||clause.length>1500)return [];
 const parts=clause.split(/,\s*(?:and\s+)?|\s+and\s+(?=(?:a|an|one|two|three|four|five|six|\d+)\s)/).filter(Boolean);
 const counts:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 const result:Piece[]=[];
 for(const part of parts){
  const m=part.trim().match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+)$/i);
  let label=m?m[2]:part.trim(),quantity=m?(counts[m[1].toLowerCase()]||Number(m[1])||1):1;
  if(m&&/^(?:part|piece)\s+/i.test(label)){label=m[1]+'-'+label;quantity=1;}
  const removable=label.match(/^(.*?)\s+with (?:a |an )?removable (.+)$/i);
  if(removable){result.push({id:'gear-'+pieceKey(removable[1]),label:removable[1],quantity,owned:null});label='Removable '+removable[2]+' for '+removable[1];}
  if(label.length>1&&label.length<=200)result.push({id:'gear-'+pieceKey(label),label,quantity,owned:null});
 }
 return result;
}
