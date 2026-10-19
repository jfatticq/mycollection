import {requestJSON} from '@/lib/api-client';
import {uploadImage} from '@/lib/media/browser-image';
export async function uploadCatalogPartPhoto(releaseId:string,partId:string,file:File,sortOrder:number){
 const form=new FormData();form.set('scope','catalog');form.set('file',await uploadImage(file));
 const media=await requestJSON<{id:string}>('/api/photo',{method:'POST',body:form});
 await requestJSON('/api/media/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mediaId:media.id,partId,sortOrder,primary:false})});
 return requestJSON<{images:any[]}>('/api/catalog?id='+encodeURIComponent(releaseId));
}
