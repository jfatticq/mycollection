import {identityFor} from '@/lib/catalog-reliability';
import catalog,{canonicalId} from '@/lib/catalog';
import photos from '@/lib/reference-photos.json';
import staticPhotos from '@/lib/static-photos.json';
import {accessoryImages} from '@/lib/accessory-images';
import {bucket} from '@/lib/db';
const allowed=new Set(['www.yojoe.com','www.actionfigure411.com','www.3djoes.com','3djoes.com']);
function permitted(url:string){const u=new URL(url);return u.protocol==='https:'&&allowed.has(u.hostname);}
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');const item=catalog.find(x=>x.id===canonicalId(id||''));
 if(!item)return new Response('Unknown release',{status:404});
 const params=new URL(request.url).searchParams;const full=params.get('view')==='full';const packaged=params.get('view')==='packaged'||(full&&params.get('packaged')==='1');
 const extra=(photos as Record<string,any>)[item.id];
 const local=extra?.localImage||(staticPhotos as Record<string,string>)[item.id];
 if(!packaged&&!full&&local)return new Response(null,{status:302,headers:{Location:local,'Cache-Control':'private, max-age=604800'}});
 const key='reference/v2/'+item.id+(packaged?(full?'/packaged-full':'/packaged'):full?'/full':'/loose');
 try{
  const store=bucket();const cached=await store.get(key);
  if(cached)return new Response(cached.body,{headers:{'Content-Type':cached.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'}});
  let url=packaged?extra?.packageImage:(item.image||extra?.image);
  if(full&&!packaged&&identityFor(item).entityType!=='package'){const gallery=await accessoryImages(item.id).catch(()=>null);url=gallery?.reference||url?.replace('/images/thumbs/','/images/');}
  if(full&&url?.includes('www.yojoe.com/images/resize/'))url=url.replace(/\/images\/resize\/[wh]\/\d+\//,'/images/resize/w/MAX/');
  if(!packaged&&!url&&item.url.includes('3djoes.com')){
   const page=await fetch(item.url,{signal:AbortSignal.timeout(12000)});if(!page.ok)throw Error('Reference unavailable');
   const html=await page.text();const body=html.split(/id=["']wsite-content["']/i)[1];
   if(body){const img=body.match(/<img\b[^>]*\bsrc=["']([^"']+\.(?:jpg|jpeg|png)(?:\?[^"']*)?)["']/i);if(img)url=new URL(img[1].replaceAll('&amp;','&'),item.url).href;}
  }
  if(!url||!permitted(url))return new Response('No reference photo',{status:404});
  const photo=await fetch(url,{signal:AbortSignal.timeout(15000)});
  const type=photo.headers.get('content-type')?.split(';')[0]||'';
  if(!photo.ok||!['image/jpeg','image/png','image/webp','image/gif'].includes(type)||Number(photo.headers.get('content-length')||0)>8*1024*1024)throw Error('Reference photo unavailable');
  const bytes=await photo.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error('Reference photo too large');
  await store.put(key,bytes,{httpMetadata:{contentType:type}});
  return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.error('Reference photo unavailable',item.id);return new Response('Reference photo unavailable',{status:503});}
}
