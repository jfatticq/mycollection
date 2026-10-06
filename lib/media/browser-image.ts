export async function uploadImage(file:File){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a JPG, PNG or WebP under 8 MB.');
  const bitmap=await createImageBitmap(file);
  try{const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const context=canvas.getContext('2d');if(!context)throw Error('Image processing is unavailable.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('Image could not be processed.');return new File([blob],'photo.jpg',{type:'image/jpeg'});}finally{bitmap.close();}
}
