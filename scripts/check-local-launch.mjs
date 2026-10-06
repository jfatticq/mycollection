// Explicitly local-only HTTP smoke test. Create and remove only this run's own test record/photo.
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
const base=new URL(process.argv[2]??'');
if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Provide the exact local preview URL. Production is not supported.');
const signIn=await fetch(new URL('/signin-with-chatgpt?return_to=%2F',base),{redirect:'manual'});
assert.equal(signIn.status,302);const cookie=signIn.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert(cookie);
async function api(path,body,method='POST'){const response=await fetch(new URL(path,base),{method:body===undefined?'GET':method,headers:{Cookie:cookie,...(body!==undefined?{Origin:base.origin}:{}),...(body instanceof FormData?{}:body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});if(!response.ok)throw Error(path+': '+response.status+' '+await response.text());return response;}
let entryId=null,photoId=null;
try{
 const account=await (await api('/api/account')).json();assert(account.collectionId);
 const name='Local launch check '+crypto.randomUUID();
 const preview=await (await api('/api/transfer',{action:'preview',kind:'collection',format:'json',text:JSON.stringify({version:1,kind:'collection',items:[{name,notes:'LOCAL PRIVATE NOTE',unidentifiedParts:[{name:'Unknown accessory',quantity:null}]}]})})).json();assert.equal(preview.errors.length,0);entryId=preview.rows[0].id;
 await api('/api/transfer',{action:'commit',previewId:preview.previewId});
 const form=new FormData();form.set('file',new File([jpeg.encode({width:2,height:2,data:new Uint8Array(16).fill(255),comments:['REMOVE THIS METADATA']},85).data],'test.jpg',{type:'image/jpeg'}));
 const photo=await (await api('/api/photo',form)).json();photoId=photo.id;await api('/api/media/links',{mediaId:photo.id,entryId});
 const collection=await (await api('/api/collection')).json();const record=collection.items.find(item=>item.id===entryId);assert.equal(record.name,name);assert.equal(record.unidentifiedParts[0].quantity,null);assert(record.photos.includes(photo.url));
 const image=await api(photo.url);assert.equal(image.headers.get('content-type'),'image/jpeg');const bytes=Buffer.from(await image.arrayBuffer());assert(!bytes.includes(Buffer.from('REMOVE THIS METADATA')));assert.equal(jpeg.decode(bytes).width,2);
 const exported=await (await api('/api/transfer?format=json')).json();assert(exported.items.some(item=>item.id===entryId));
 for(const [path,title] of [['/admin','Catalog administration'],['/settings','Profile'],['/transfer','Import'],['/collectors','Public collections']]){const response=await fetch(new URL(path,base));assert.equal(response.status,200);assert((await response.text()).includes(title));}
}finally{
 if(entryId)await api('/api/collection',{action:'delete',item:{id:entryId}});
 if(photoId)await api('/api/photo?id='+photoId,{},'DELETE');
}
assert(!(await (await api('/api/collection')).json()).items.some(item=>item.id===entryId));
console.log('Local HTTP smoke passed: sign-in, staged import, normalized collection, real D1/R2 JPEG processing, private export, launch page rendering and cleanup.');
