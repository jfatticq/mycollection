import {accessoryImages,allowedAccessoryImage} from '@/lib/accessory-images';
import {canonicalId} from '@/lib/catalog';
import {bucket} from '@/lib/db';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,id=params.get('id'),photo=params.get('photo'),full=params.get('size')==='full';
 if(!id||!photo||!/^[a-f0-9]{8}$/.test(photo))return new Response('Not found',{status:404});
 try{const gallery=await accessoryImages(id),image=gallery?.images.find(p=>p.key===photo),url=image&&(full?image.full:image.thumbnail);if(!url||!allowedAccessoryImage(url))return new Response('Not found',{status:404});
 const key='accessory-photo/v1/'+canonicalId(id)+'/'+photo+(full?'/full':'/thumbnail'),store=bucket(),cached=await store.get(key);
 if(cached)return new Response(cached.body,{headers:{'Content-Type':cached.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'}});
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),type=response.headers.get('content-type')?.split(';')[0]||'';
 if(!response.ok||!['image/jpeg','image/png','image/webp','image/gif'].includes(type)||Number(response.headers.get('content-length')||0)>8*1024*1024)throw Error();const bytes=await response.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error();await store.put(key,bytes,{httpMetadata:{contentType:type}});return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Accessory photo unavailable',{status:503});}
}
