import { db } from '@/lib/db';
import { Actor, AccessError } from '@/lib/auth/access';
export async function readableMedia(id: string, a: Actor | null) {
    // Every retrieval rechecks current visibility; an unattached upload is private.
    const row = await db().prepare(`SELECT m.object_key,m.content_type FROM media m JOIN users u ON u.id=m.owner_id WHERE m.id=? AND u.deleted_at IS NULL AND (
    (m.scope='catalog' AND EXISTS(SELECT 1 FROM media_links l WHERE l.media_id=m.id AND l.entry_id IS NULL)) OR
    (m.owner_id=? AND m.scope='catalog') OR
    (m.scope='collection' AND EXISTS(SELECT 1 FROM collections c WHERE c.id=m.collection_id AND c.user_id=m.owner_id AND
      (c.user_id=? OR (? IS NOT NULL AND c.visibility='public' AND EXISTS(SELECT 1 FROM media_links l JOIN owned_entries e ON e.id=l.entry_id WHERE l.media_id=m.id AND e.collection_id=c.id)))))
  )`).bind(id, a?.id ?? null, a?.id ?? null, a?.id ?? null).first<{
        object_key: string;
        content_type: string;
    }>();
    if (!row)
        throw new AccessError(404, 'Photo not found.');
    return row;
}
export async function linkMedia(a: Actor, input: any) {
    if (!input || typeof input.mediaId !== 'string')
        throw new AccessError(400, 'Media ID required.');
    const targets = ['entryId', 'releaseId', 'partId', 'fileCardId'] as const;
    const selected = targets.filter(k => typeof input[k] === 'string');
    if (selected.length !== 1)
        throw new AccessError(400, 'Choose one photo subject.');
    const target = selected[0];
    const store = db();
    const media = await store.prepare('SELECT owner_id,collection_id,scope FROM media WHERE id=? AND owner_id=?').bind(input.mediaId, a.id).first<{
        collection_id: string | null;
        scope: string;
    }>();
    if (!media)
        throw new AccessError(404, 'Photo not found.');
    if (target === 'entryId') {
        const count=await store.prepare('SELECT COUNT(*) AS count FROM media_links WHERE entry_id=?').bind(input.entryId).first<{count:number}>();if((count?.count??0)>=10)throw new AccessError(400,'Maximum ten images per copy.');
        if (media.scope !== 'collection' || media.collection_id !== a.collectionId || !await store.prepare('SELECT id FROM owned_entries WHERE id=? AND collection_id=?').bind(input.entryId, a.collectionId).first())
            throw new AccessError(404, 'Entry not found.');
    }
    else {
        if (!a.isAdmin)
            throw new AccessError(403, 'Only the catalog administrator can attach catalog photos.');
        if (media.scope !== 'catalog')
            throw new AccessError(400, 'Private collection photos cannot become catalog photos. Upload a catalog photo separately.');
        const table = { releaseId: 'catalog_releases', partId: 'catalog_parts', fileCardId: 'file_cards' }[target];
        if (!await store.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(input[target]).first())
            throw new AccessError(404, 'Catalog subject not found.');
    }
    const order = input.sortOrder ?? 0;
    if (!Number.isInteger(order) || order < 0 || order > 1000)
        throw new AccessError(400, 'Invalid image order.');
    const column={entryId:'entry_id',releaseId:'release_id',partId:'part_id',fileCardId:'file_card_id'}[target];
    if(await store.prepare(`SELECT id FROM media_links WHERE media_id=? AND ${column}=?`).bind(input.mediaId,input[target]).first())return;
    const result=await store.prepare('INSERT INTO media_links(id,media_id,entry_id,release_id,part_id,file_card_id,sort_order,"primary") SELECT ?,?,?,?,?,?,?,? WHERE (? IS NULL OR (SELECT COUNT(*) FROM media_links WHERE entry_id=?)<10)').bind(crypto.randomUUID(), input.mediaId, target === 'entryId' ? input.entryId : null, target === 'releaseId' ? input.releaseId : null, target === 'partId' ? input.partId : null, target === 'fileCardId' ? input.fileCardId : null, order, input.primary === true ? 1 : 0,target==='entryId'?input.entryId:null,target==='entryId'?input.entryId:null).run();
    if(!result.meta.changes)throw new AccessError(400,'Maximum ten images per copy.');
}
