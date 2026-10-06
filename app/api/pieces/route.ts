import catalog,{canonicalId} from '@/lib/catalog';
import snapshots from '@/lib/accessory-snapshots.json';
import sources from '@/lib/accessory-sources.json';
import {parseAccessories} from '@/lib/collection-details';
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');const ref=catalog.find(x=>x.id===canonicalId(id||''));
 const saved=(snapshots as Record<string,any>)[id||'']||(snapshots as Record<string,any>)[canonicalId(id||'')];
 if(saved)return Response.json(saved);
 const source=(sources as Record<string,any>)[ref?.id||'']?.url||ref?.accessoryUrl||(ref?.source==='YoJoe'?ref.url:undefined);
 if(!ref||!source)return Response.json({error:'No verified accessory list is connected to this release yet. Add pieces below using your item or its release reference.'},{status:404});
 try{const r=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const h=await r.text();const section=h.match(/<h2[^>]*>\s*Accessories\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
 if(!section)throw Error();const text=section[1].replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"');const pieces=parseAccessories(text);if(!pieces.length)throw Error();return Response.json({pieces,source,status:'partial',checked:new Date().toISOString().slice(0,10),note:'Sourced accessories; review completeness against the exact release.'});
 }catch{return Response.json({error:'Accessory lookup is temporarily unavailable. You can still add and save pieces manually.'},{status:503});}
}
