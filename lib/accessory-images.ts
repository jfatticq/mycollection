import catalog,{canonicalId} from './catalog';
import inventories from './accessory-snapshots.json';
import sources from './accessory-sources.json';
import captured from './accessory-images.json';
import {bucket} from './db';
export type AccessoryImage={key:string;caption:string;thumbnail:string;full:string;credit:string};
export type AccessoryImages={source:string;images:AccessoryImage[];reference?:string};
const imageKey=(url:string)=>{let hash=2166136261;for(const byte of new TextEncoder().encode(url))hash=Math.imul(hash^byte,16777619)>>>0;return hash.toString(16).padStart(8,'0');};
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
export function allowedAccessoryImage(url:string){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.yojoe.com'&&/\.(?:jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(u.pathname+u.search);}catch{return false;}}
export function parseAccessoryImages(html:string,source:string,vehicle=false):AccessoryImages{
 const result:AccessoryImages={source,images:[]};
 const section=(heading:string)=>html.match(new RegExp('<h[23][^>]*>\\s*'+heading+'\\s*</h[23]>([\\s\\S]*?)(?=<h[23]|$)','i'))?.[1]||'';
 const read=(body:string)=>{const images:AccessoryImage[]=[];const seen=new Set<string>();for(const match of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const tag=match[2].match(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)?.[0];const img=tag?.match(/src=["']([^"']+)["']/i);if(!img||!tag)continue;
  const full=new URL(match[1].replaceAll('&amp;','&'),source).href,thumbnail=new URL(img[1].replaceAll('&amp;','&'),source).href;
  if(!allowedAccessoryImage(full)||!allowedAccessoryImage(thumbnail)||seen.has(full))continue;seen.add(full);
  const alt=tag.match(/alt=(["'])([\s\S]*?)\1/i)?.[2]||'';
  const caption=clean(match[2].match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]||alt.split(/<br/i)[0])||'Accessory';
  const credit=clean(alt.match(/Contributed by:\s*([^<]*)/i)?.[1]||'');
  images.push({key:imageKey(full),caption,full,thumbnail,credit:credit?'Photo: '+credit:'YoJoe reference photo'});
 }return images;};
 const main=read(section('Images'));result.reference=(main.find(p=>/^front$/i.test(p.caption))||main[0])?.full;
 const gear=read(section('Accessories'));
 result.images=gear.length?gear:vehicle?main.filter(p=>/\b(?:parts|missiles?|bombs?|canopy|antenna|landing gear|wheels?|cannons?|guns?|ramp|panels?|doors?|engine|rotors?|propellers?|hoses?|seats?|launchers?|fuel tanks?|wings?)\b/i.test(p.caption)):[];
 return result;
}
export async function accessoryImages(releaseId:string):Promise<AccessoryImages|null>{
 const id=canonicalId(releaseId),ref=catalog.find(r=>r.id===id);if(!ref)return null;
 const fixed=(captured as Record<string,AccessoryImages>)[id];if(fixed)return fixed;
 const source=(sources as Record<string,any>)[id]?.url||(inventories as Record<string,any>)[id]?.source||ref.accessoryUrl||(ref.source==='YoJoe'?ref.url:null);
 if(!source||new URL(source).hostname!=='www.yojoe.com')return null;
 const key='accessory-gallery/v1/'+id,store=bucket();const cached=await store.get(key);if(cached)return JSON.parse(await cached.text());
 const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Accessory photos unavailable');
 const gallery=parseAccessoryImages(await response.text(),source,ref.kind==='Vehicle / playset');
 await store.put(key,JSON.stringify(gallery),{httpMetadata:{contentType:'application/json'}});return gallery;
}
