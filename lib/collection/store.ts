import { db } from '@/lib/db';
import { Actor, AccessError } from '@/lib/auth/access';
import { entryInput, validateParts, Part } from './input';
export async function entries(collectionId: string, own: boolean) {
    // Owner-only facts are never selected for another collector's response.
    const privateColumns = own ? ',e.private_notes,e.location,e.acquired_at,e.purchase_price_cents,e.purchase_currency,e.purchase_source' : '';
    const rows = await db().prepare(`SELECT e.id,e.name,e.release_id,e.ownership,e.condition,e.completeness,e.packaging,e.sealed,e.reviewed_revision,r.revision AS catalog_revision,r.line,r.year,r.kind,r.character,r.series,r.sub_series,r.wave,r.scale,r.faction,r.market,r.manufacturer,r.product_code,r.upc ${privateColumns} FROM owned_entries e LEFT JOIN catalog_releases r ON r.id=e.release_id WHERE e.collection_id=? ORDER BY e.created_at,e.id`).bind(collectionId).all<Record<string, any>>();
    const parts = await db().prepare(`SELECT p.entry_id,p.part_id,p.quantity,p.condition,p.defects,k.name AS label,k.expected_quantity,k.retired FROM owned_parts p JOIN owned_entries e ON e.id=p.entry_id JOIN catalog_parts k ON k.id=p.part_id WHERE e.collection_id=?`).bind(collectionId).all<Record<string, any>>();
    const loose = await db().prepare(`SELECT p.* FROM unidentified_parts p JOIN owned_entries e ON e.id=p.entry_id WHERE e.collection_id=?`).bind(collectionId).all<Record<string, any>>();
    const photos = await db().prepare(`SELECT l.entry_id,m.id FROM media_links l JOIN media m ON m.id=l.media_id JOIN owned_entries e ON e.id=l.entry_id JOIN collections c ON c.id=e.collection_id WHERE e.collection_id=? AND m.scope='collection' AND m.collection_id=c.id AND m.owner_id=c.user_id ORDER BY l.sort_order,l.id`).bind(collectionId).all<Record<string, any>>();
    const terms=await db().prepare('SELECT DISTINCT rt.release_id,rt.taxonomy_id FROM release_taxonomy rt JOIN owned_entries e ON e.release_id=rt.release_id WHERE e.collection_id=?').bind(collectionId).all<{release_id:string;taxonomy_id:string}>();
    return rows.results.map(e => ({
        id: e.id, name: e.name, releaseId: e.release_id, quantity: 1, ownership: e.ownership,
        condition: e.condition, completeness: e.completeness, packaging: e.packaging, sealed: e.sealed === null ? null : !!e.sealed,
        reviewedRevision: e.reviewed_revision, needsReview: e.release_id !== null && e.reviewed_revision !== e.catalog_revision,
        line: e.line, year: e.year,kind:e.kind,character:e.character,series:e.series,sub_series:e.sub_series,wave:e.wave,scale:e.scale,faction:e.faction,market:e.market,manufacturer:e.manufacturer,product_code:e.product_code,upc:e.upc,
        taxonomyIds:terms.results.filter(t=>t.release_id===e.release_id).map(t=>t.taxonomy_id),
        parts: parts.results.filter(p => p.entry_id === e.id).map(p => ({ partId: p.part_id, label: p.label, quantity: p.quantity, condition: p.condition, defects: p.defects,expectedQuantity:p.expected_quantity,retired:!!p.retired })),
        unidentifiedParts: loose.results.filter(p => p.entry_id === e.id).map(p => ({ name: p.name, quantity: p.quantity, condition: p.condition, defects: p.defects })),
        photos: photos.results.filter(p => p.entry_id === e.id).map(p => '/api/photo?id=' + p.id),
        ...(own ? { notes: e.private_notes, location: e.location, acquiredAt: e.acquired_at, purchasePriceCents: e.purchase_price_cents, purchaseCurrency: e.purchase_currency, purchaseSource: e.purchase_source } : {}),
    }));
}
export async function prepareEntry(a: Actor, input: unknown) {
    const parsed = entryInput.safeParse(input);
    if (!parsed.success)
        throw new AccessError(400, 'Invalid entry. Each copy needs its own record and supported condition/parts fields.');
    const item = parsed.data, store = db(), id = item.id ?? crypto.randomUUID();
    const old = await store.prepare('SELECT collection_id,release_id FROM owned_entries WHERE id=?').bind(id).first<{
        collection_id: string;
        release_id: string | null;
    }>();
    if (old && old.collection_id !== a.collectionId)
        throw new AccessError(404, 'Entry not found.');
    let parts: Part[] = [], revision: number | null = null;
    if (item.releaseId) {
        const release = await store.prepare('SELECT revision,retired FROM catalog_releases WHERE id=?').bind(item.releaseId).first<{
            revision: number;
            retired: number;
        }>();
        if (!release || (release.retired && old?.release_id !== item.releaseId))
            throw new AccessError(400, 'Choose a published catalog release.');
        revision = release.revision;
        parts = (await store.prepare('SELECT id,kind,expected_quantity,retired FROM catalog_parts WHERE release_id=?').bind(item.releaseId).all<Part>()).results;
    }
    else if (item.parts.length)
        throw new AccessError(400, 'Catalog parts require a catalog release.');
    if (item.reviewedRevision !== null && item.reviewedRevision !== revision)
        throw new AccessError(400, 'Review the current catalog revision.');
    if (old?.release_id === item.releaseId && item.releaseId) {
        const retired = await store.prepare('SELECT p.part_id,p.quantity,p.condition,p.defects FROM owned_parts p JOIN catalog_parts k ON k.id=p.part_id WHERE p.entry_id=? AND k.retired=1').bind(id).all<{
            part_id: string;
            quantity: number | null;
            condition: any;
            defects: string;
        }>();
        for (const p of retired.results)
            if (!item.parts.some(q => q.partId === p.part_id))
                item.parts.push({ partId: p.part_id, quantity: p.quantity, condition: p.condition, defects: p.defects });
    }
    if (item.sealed === true && item.packaging !== 'present')
        throw new AccessError(400, 'Sealed packaging must be present.');
    const ownership = validateParts(item, parts, !old);
    const reviewed = !old ? revision : item.reviewedRevision;
    const photoIds = item.photos?.map(p => p.split('=')[1]);
    if (photoIds && new Set(photoIds).size !== photoIds.length)
        throw new AccessError(400, 'Duplicate photo.');
    for (const mediaId of photoIds ?? []) {
        if (!await store.prepare("SELECT id FROM media WHERE id=? AND owner_id=? AND collection_id=? AND scope='collection'").bind(mediaId, a.id, a.collectionId).first())
            throw new AccessError(400, 'Photo is not part of your collection.');
    }
    const now = new Date().toISOString();
    const guard = 'EXISTS(SELECT 1 FROM owned_entries WHERE id=? AND collection_id=?)';
    const statements = [
        store.prepare(`DELETE FROM owned_parts WHERE entry_id=? AND ${guard}`).bind(id, id, a.collectionId),
        store.prepare(`DELETE FROM unidentified_parts WHERE entry_id=? AND ${guard}`).bind(id, id, a.collectionId),
        store.prepare(`INSERT INTO owned_entries(id,collection_id,release_id,name,ownership,condition,completeness,packaging,sealed,reviewed_revision,private_notes,location,acquired_at,purchase_price_cents,purchase_currency,purchase_source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET release_id=excluded.release_id,name=excluded.name,ownership=excluded.ownership,condition=excluded.condition,completeness=excluded.completeness,packaging=excluded.packaging,sealed=excluded.sealed,reviewed_revision=excluded.reviewed_revision,private_notes=excluded.private_notes,location=excluded.location,acquired_at=excluded.acquired_at,purchase_price_cents=excluded.purchase_price_cents,purchase_currency=excluded.purchase_currency,purchase_source=excluded.purchase_source,updated_at=excluded.updated_at WHERE owned_entries.collection_id=excluded.collection_id`).bind(id, a.collectionId, item.releaseId ?? null, item.name, ownership, item.condition, item.completeness, item.packaging, item.sealed === null ? null : Number(item.sealed), reviewed, item.notes, item.location, item.acquiredAt, item.purchasePriceCents, item.purchaseCurrency, item.purchaseSource, now, now),
    ];
    for (const p of item.parts)
        statements.push(store.prepare(`INSERT INTO owned_parts(entry_id,part_id,release_id,quantity,condition,defects) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id, p.partId, item.releaseId, p.quantity, p.condition, p.defects, id, a.collectionId));
    for (const p of item.unidentifiedParts)
        statements.push(store.prepare(`INSERT INTO unidentified_parts(id,entry_id,name,quantity,condition,defects) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(), id, p.name, p.quantity, p.condition, p.defects, id, a.collectionId));
    if (photoIds) {
        statements.push(store.prepare(`DELETE FROM media_links WHERE entry_id=? AND ${guard}`).bind(id, id, a.collectionId));
        photoIds.forEach((mediaId, order) => statements.push(store.prepare(`INSERT INTO media_links(id,media_id,entry_id,sort_order,"primary") SELECT ?,?,?,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM media WHERE id=? AND owner_id=? AND collection_id=? AND scope='collection')`).bind(crypto.randomUUID(), mediaId, id, order, order === 0 ? 1 : 0, id, a.collectionId, mediaId, a.id, a.collectionId)));
    }
    return { id, statements };
}
export async function saveEntry(a: Actor, input: unknown) {
    const { id, statements } = await prepareEntry(a, input);
    try{await db().batch(statements);}catch(e){if(String(e).includes('merged release requires reload'))throw new AccessError(409,'This release was merged. Reload this copy before saving.');throw e;}
    const result = (await entries(a.collectionId, true)).find(e => e.id === id);
    if (!result)
        throw new AccessError(404, 'Entry not found.');
    return result;
}
