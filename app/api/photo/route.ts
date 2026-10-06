import { bucket, db } from '@/lib/db';
import { actor, mutation, json, failure, privateHeaders, AccessError } from '@/lib/auth/access';
import { readableMedia } from '@/lib/media/access';
import { cleanImage } from '@/lib/media/image';
import { limit,boundedBytes } from '@/lib/limits';
export async function POST(request: Request) {
    try {
        mutation(request);
        const a = await actor(request);
        await limit(a.id,'photo-upload',30,3600);
        if(Number(request.headers.get('content-length')??0)>9*1024*1024)throw new AccessError(413,'Upload is too large.');
        const raw=await boundedBytes(request,9*1024*1024);
        const form = await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
        const scope = form.get('scope') || 'collection';
        if (!['collection', 'catalog'].includes(String(scope)))
            throw new AccessError(400, 'Invalid upload scope.');
        if (scope === 'catalog' && !a.isAdmin)
            throw new AccessError(403, 'Only the administrator can upload catalog photos.');
        const file = form.get('file');
        if (!(file instanceof File) || file.type!=='image/jpeg' || file.size === 0 || file.size > 8 * 1024 * 1024)
            throw new AccessError(400, 'Upload a processed JPEG under 8 MB. Use the site uploader to convert PNG or WebP.');
        const bytes = cleanImage(new Uint8Array(await file.arrayBuffer()));
        const id = crypto.randomUUID(), key = (scope === 'catalog' ? 'catalog/' : 'collections/' + a.collectionId + '/') + id;
        const store = bucket();
        await store.put(key, bytes, { httpMetadata: { contentType: file.type } });
        try {
            await db().prepare('INSERT INTO media(id,object_key,owner_id,collection_id,scope,content_type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, key, a.id, scope === 'collection' ? a.collectionId : null, scope, file.type, bytes.length, new Date().toISOString()).run();
        }
        catch (e) {
            try{await store.delete(key);}catch{
                // A deletion may have revoked this in-flight upload. Keep failed compensation resumable.
                await db().prepare("UPDATE deletion_jobs SET remaining_keys=json_insert(remaining_keys,'$[#]',?),state='pending',updated_at=? WHERE user_id=?").bind(key,new Date().toISOString(),a.id).run();
            }
            throw e;
        }
        return json({ id, url: '/api/photo?id=' + id });
    }
    catch (e) {
        return failure(e);
    }
}
export async function GET(request: Request) { try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-f0-9-]{36}$/.test(id))
        throw new AccessError(404, 'Photo not found.');
    const a = request.headers.get('oai-authenticated-user-id') ? await actor(request) : null;
    const metadata = await readableMedia(id, a);
    const object = await bucket().get(metadata.object_key);
    if (!object)
        throw new AccessError(404, 'Photo not found.');
    return new Response(object.body, { headers: { ...privateHeaders, 'Content-Type': metadata.content_type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
catch (e) {
    return failure(e);
} }
export async function DELETE(request:Request){try{
  mutation(request);const a=await actor(request);const id=new URL(request.url).searchParams.get('id');
  const media=await db().prepare("SELECT object_key FROM media WHERE id=? AND owner_id=? AND scope='collection' AND NOT EXISTS(SELECT 1 FROM media_links WHERE media_id=media.id)").bind(id,a.id).first<{object_key:string}>();
  if(!media)throw new AccessError(404,'Unlinked photo not found.');await bucket().delete(media.object_key);await db().prepare('DELETE FROM media WHERE id=? AND owner_id=?').bind(id,a.id).run();return json({ok:true});
}catch(e){return failure(e);} }
