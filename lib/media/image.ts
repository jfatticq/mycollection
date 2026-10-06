import jpeg from 'jpeg-js';
import { AccessError } from '@/lib/auth/access';
export function cleanImage(bytes:Uint8Array){
  try{
    const decoded=jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:48});
    if(!decoded.width||!decoded.height||decoded.width>4000||decoded.height>4000)throw Error('Dimensions');
    // Construct a fresh pixel object: never carry EXIF, comments or source metadata into encoding.
    const clean=jpeg.encode({width:decoded.width,height:decoded.height,data:decoded.data},85).data;
    if(clean.length>8*1024*1024)throw Error('Size');return clean;
  }catch{throw new AccessError(400,'Image could not be decoded safely. Choose another image (maximum 4 megapixels after resizing).');}
}
