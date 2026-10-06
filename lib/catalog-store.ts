import { z } from 'zod';
import { db } from '@/lib/db';
import { Actor, AccessError } from '@/lib/auth/access';
const short = z.string().trim().max(200).nullable().default(null);
const part = z.object({ id: z.string().min(1).max(128), parentId: z.string().min(1).max(128).nullable().default(null), name: z.string().trim().min(1).max(200), kind: z.enum(['primary', 'accessory', 'packaging', 'paperwork']), expectedQuantity: z.number().int().min(0).max(9999).nullable(), sortOrder: z.number().int().min(0).max(1000).default(0), linkedReleaseId: z.string().min(1).max(128).nullable().default(null) }).strict();
export const releaseInput = z.object({
    id: z.string().min(1).max(128).optional(), expectedRevision: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200), kind: z.enum(['figure', 'vehicle', 'playset', 'accessory', 'multipack', 'other']),
    character: short, year: z.number().int().min(1960).max(2200).nullable().default(null), line: short,
    series: short, subSeries: short, wave: short, scale: short, faction: short, market: short, manufacturer: short, productCode: short, upc: short,
    retailPriceCents: z.number().int().min(0).max(1000000000).nullable().default(null), retailCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null), retired: z.boolean().default(false),
    parts: z.array(part).max(500).default([]),
    fileCards: z.array(z.object({ id: z.string().min(1).max(128), text: z.string().max(30000) }).strict()).max(20).default([]),
    taxonomyIds: z.array(z.string().min(1).max(128)).max(100).default([]),
    related: z.array(z.object({ id: z.string().min(1).max(128), kind: z.enum(['variant','repaint','international','packaging','related']) }).strict()).max(100).default([]),
}).strict();
export async function prepareRelease(a: Actor, input: unknown, allowedIds: string[] = []) {
    if (!a.isAdmin)
        throw new AccessError(403, 'Catalog administrator required.');
    const parsed = releaseInput.safeParse(input);
    if (!parsed.success)
        throw new AccessError(400, 'Invalid catalog release.');
    const r = parsed.data, id = r.id ?? crypto.randomUUID(), store = db();
    if (await store.prepare('SELECT source_id FROM catalog_merges WHERE source_id=?').bind(id).first()) throw new AccessError(409, 'This release was merged. Edit the surviving release.');
    for (const taxonomyId of r.taxonomyIds) if (!await store.prepare('SELECT id FROM taxonomy WHERE id=?').bind(taxonomyId).first()) throw new AccessError(400, 'Unknown taxonomy ID.');
    for (const related of r.related) if (related.id === id || (!allowedIds.includes(related.id) && !await store.prepare('SELECT id FROM catalog_releases WHERE id=?').bind(related.id).first())) throw new AccessError(400, 'Invalid related release.');
    const old = await store.prepare('SELECT revision FROM catalog_releases WHERE id=?').bind(id).first<{
        revision: number;
    }>();
    if (old && r.expectedRevision !== old.revision)
        throw new AccessError(409, 'Catalog changed. Reload before saving.');
    if (new Set(r.parts.map(p => p.id)).size !== r.parts.length || new Set(r.fileCards.map(c => c.id)).size !== r.fileCards.length)
        throw new AccessError(400, 'Duplicate catalog component ID.');
    // Sort parents before children and reject cycles, including indirect cycles.
    const ordered: typeof r.parts = [], visited = new Set<string>(), visiting = new Set<string>();
    function visit(p: typeof part._output) {
        if (visited.has(p.id))
            return;
        if (visiting.has(p.id))
            throw new AccessError(400, 'Parts cannot contain cycles.');
        visiting.add(p.id);
        if (p.parentId) {
            const parent = r.parts.find(q => q.id === p.parentId);
            if (!parent)
                throw new AccessError(400, 'Parent must belong to this release.');
            visit(parent);
        }
        visiting.delete(p.id);
        visited.add(p.id);
        ordered.push(p);
    }
    r.parts.forEach(visit);
    for (const p of r.parts) {
        const existing = await store.prepare('SELECT release_id FROM catalog_parts WHERE id=?').bind(p.id).first<{
            release_id: string;
        }>();
        if (existing && existing.release_id !== id)
            throw new AccessError(400, 'Part ID belongs to another release.');
        if (p.linkedReleaseId && !allowedIds.includes(p.linkedReleaseId) && !await store.prepare('SELECT id FROM catalog_releases WHERE id=?').bind(p.linkedReleaseId).first())
            throw new AccessError(400, 'Linked release not found.');
    }
    for (const c of r.fileCards) {
        const existing = await store.prepare('SELECT release_id FROM file_cards WHERE id=?').bind(c.id).first<{
            release_id: string;
        }>();
        if (existing && existing.release_id !== id)
            throw new AccessError(400, 'File card ID belongs to another release.');
    }
    const revision = (old?.revision ?? 0) + 1, now = new Date().toISOString();
    const statements = [store.prepare(`INSERT INTO catalog_releases(id,name,kind,character,year,line,series,sub_series,wave,scale,faction,market,manufacturer,product_code,upc,retail_price_cents,retail_currency,revision,retired,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,character=excluded.character,year=excluded.year,line=excluded.line,series=excluded.series,sub_series=excluded.sub_series,wave=excluded.wave,scale=excluded.scale,faction=excluded.faction,market=excluded.market,manufacturer=excluded.manufacturer,product_code=excluded.product_code,upc=excluded.upc,retail_price_cents=excluded.retail_price_cents,retail_currency=excluded.retail_currency,revision=excluded.revision,retired=excluded.retired,updated_at=excluded.updated_at`).bind(id, r.name, r.kind, r.character, r.year, r.line, r.series, r.subSeries, r.wave, r.scale, r.faction, r.market, r.manufacturer, r.productCode, r.upc, r.retailPriceCents, r.retailCurrency, revision, Number(r.retired), now, now),
        store.prepare('UPDATE catalog_parts SET retired=1 WHERE release_id=?').bind(id)];
    for (const p of ordered)
        statements.push(store.prepare(`INSERT INTO catalog_parts(id,release_id,parent_id,name,kind,expected_quantity,sort_order,retired,linked_release_id) VALUES(?,?,?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,kind=excluded.kind,expected_quantity=excluded.expected_quantity,sort_order=excluded.sort_order,retired=0,linked_release_id=excluded.linked_release_id WHERE catalog_parts.release_id=excluded.release_id`).bind(p.id, id, p.parentId, p.name, p.kind, p.expectedQuantity, p.sortOrder, p.linkedReleaseId));
    for (const c of r.fileCards)
        statements.push(store.prepare('INSERT INTO file_cards(id,release_id,text) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text WHERE file_cards.release_id=excluded.release_id').bind(c.id, id, c.text));
    const oldCards=await store.prepare('SELECT id FROM file_cards WHERE release_id=?').bind(id).all<{id:string}>();
    for(const card of oldCards.results)if(!r.fileCards.some(c=>c.id===card.id))statements.push(store.prepare('DELETE FROM media_links WHERE file_card_id=?').bind(card.id),store.prepare('DELETE FROM file_cards WHERE id=? AND release_id=?').bind(card.id,id));
    statements.push(store.prepare('DELETE FROM release_taxonomy WHERE release_id=?').bind(id),store.prepare('DELETE FROM release_links WHERE release_id=?').bind(id));
    for (const taxonomyId of new Set(r.taxonomyIds)) statements.push(store.prepare('INSERT INTO release_taxonomy(release_id,taxonomy_id) VALUES(?,?)').bind(id,taxonomyId));
    for (const related of r.related) statements.push(store.prepare('INSERT OR IGNORE INTO release_links(release_id,related_id,kind) VALUES(?,?,?)').bind(id,related.id,related.kind));
    statements.push(store.prepare('INSERT INTO catalog_revisions(release_id,revision,snapshot,actor_id,created_at) VALUES(?,?,?,?,?)').bind(id, revision, JSON.stringify({ ...r, id, revision }), a.id, now));
    return { id, revision, statements };
}
export async function saveRelease(a: Actor, input: unknown) {
    const {id,revision,statements} = await prepareRelease(a,input);
    await db().batch(statements);
    return { id, revision };
}
