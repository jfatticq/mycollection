import { actor, mutation, json, failure,AccessError } from '@/lib/auth/access';
import { linkMedia } from '@/lib/media/access';
import { db } from '@/lib/db';
import { bodyJSON,limit } from '@/lib/limits';
export async function POST(request: Request) { try {
    mutation(request);
    const a = await actor(request);
    await limit(a.id,'media-link',120,60);const b=await bodyJSON(request);
    if(b.action==='cover'){
      if(!a.isAdmin)throw new AccessError(403,'Administrator required.');
      if(!await db().prepare("SELECT l.id FROM media_links l JOIN media m ON m.id=l.media_id WHERE l.media_id=? AND l.release_id=? AND m.scope='catalog'").bind(b.mediaId,b.releaseId).first())throw new AccessError(404,'Catalog release photo not found.');
      await db().prepare('UPDATE media_links SET "primary"=CASE WHEN media_id=? THEN 1 ELSE 0 END WHERE release_id=?').bind(b.mediaId,b.releaseId).run();
    }else if(b.action==='unlink'){
      if(!a.isAdmin)throw new AccessError(403,'Administrator required.');
      if(typeof b.linkId!=='string')throw new AccessError(400,'Reference link ID required.');
      await db().prepare("DELETE FROM media_links WHERE id=? AND media_id=? AND entry_id IS NULL AND EXISTS(SELECT 1 FROM media WHERE id=? AND scope='catalog')").bind(b.linkId,b.mediaId,b.mediaId).run();
    }else await linkMedia(a, b);
    return json({ ok: true });
}
catch (e) {
    return failure(e);
} }
