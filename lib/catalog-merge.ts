import { db } from '@/lib/db';
import { Actor, AccessError } from '@/lib/auth/access';
export async function mergePlan(input: any) {
    if (typeof input.sourceId !== 'string' || typeof input.targetId !== 'string' || input.sourceId === input.targetId)
        throw new AccessError(400, 'Choose two different releases.');
    const store = db();
    const source = await store.prepare('SELECT * FROM catalog_releases WHERE id=?').bind(input.sourceId).first<any>();
    const target = await store.prepare('SELECT * FROM catalog_releases WHERE id=? AND retired=0').bind(input.targetId).first<any>();
    if (!source || !target || await store.prepare('SELECT source_id FROM catalog_merges WHERE source_id IN(?,?)').bind(source.id, target.id).first())
        throw new AccessError(400, 'Choose unmerged releases and an active survivor.');
    const parts = (await store.prepare('SELECT * FROM catalog_parts WHERE release_id=?').bind(source.id).all<any>()).results;
    const targetParts = (await store.prepare('SELECT * FROM catalog_parts WHERE release_id=?').bind(target.id).all<any>()).results;
    const impacted = await store.prepare('SELECT COUNT(*) AS count FROM owned_entries WHERE release_id=?').bind(source.id).first<{
        count: number;
    }>();
    return { source, target, parts, targetParts, impactedCopies: impacted?.count ?? 0 };
}
export async function mergeReleases(a: Actor, input: any) {
    if (!a.isAdmin)
        throw new AccessError(403, 'Administrator required.');
    const plan = await mergePlan(input), store = db();
    if (input.sourceRevision !== plan.source.revision || input.targetRevision !== plan.target.revision)
        throw new AccessError(409, 'Release changed. Preview again.');
    const map = input.mapping;
    if (!map || typeof map !== 'object' || Array.isArray(map))
        throw new AccessError(400, 'Map every source part or explicitly preserve it.');
    const ids = new Map<string, string>();
    const clones = new Set<string>();
    const used = new Set<string>();
    for (const part of plan.parts) {
        const decision = map[part.id];
        if (decision === 'preserve') {
            ids.set(part.id, crypto.randomUUID());
            clones.add(part.id);
        }
        else {
            if (!plan.targetParts.some(p => p.id === decision && p.kind === part.kind) || used.has(decision))
                throw new AccessError(400, 'Each part needs a unique target of the same kind or Preserve.');
            used.add(decision);
            ids.set(part.id, decision);
        }
    }
    if (Object.keys(map).some(id => !ids.has(id)))
        throw new AccessError(400, 'Unknown source part.');
    const operationId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [store.prepare('INSERT INTO operation_guards(id,valid) SELECT ?,CASE WHEN (SELECT revision FROM catalog_releases WHERE id=?)=? AND (SELECT revision FROM catalog_releases WHERE id=?)=? THEN 1 ELSE 0 END').bind(operationId, plan.source.id, input.sourceRevision, plan.target.id, input.targetRevision)];
    const inserted = new Set<string>();
    function insert(part: any) { if (!clones.has(part.id) || inserted.has(part.id))
        return; if (part.parent_id)
        insert(plan.parts.find(p => p.id === part.parent_id)); inserted.add(part.id); statements.push(store.prepare('INSERT INTO catalog_parts(id,release_id,parent_id,name,kind,expected_quantity,sort_order,retired,linked_release_id) VALUES(?,?,?,?,?,?,?,1,?)').bind(ids.get(part.id)!, plan.target.id, part.parent_id ? ids.get(part.parent_id)! : null, part.name, part.kind, part.expected_quantity, part.sort_order, part.linked_release_id)); }
    plan.parts.forEach(insert);
    // Snapshot live quantities inside this same D1 transaction, not from preflight reads.
    for (const [oldId, newId] of ids)
        statements.push(store.prepare('INSERT INTO merge_holdings(operation_id,entry_id,part_id,quantity,condition,defects) SELECT ?,p.entry_id,?,p.quantity,p.condition,p.defects FROM owned_parts p JOIN owned_entries e ON e.id=p.entry_id WHERE p.part_id=? AND e.release_id=?').bind(operationId, newId, oldId, plan.source.id));
    statements.push(store.prepare('DELETE FROM owned_parts WHERE entry_id IN(SELECT id FROM owned_entries WHERE release_id=?)').bind(plan.source.id), store.prepare("UPDATE owned_entries SET release_id=?,reviewed_revision=NULL,completeness=CASE WHEN completeness='Complete' THEN 'Partial' ELSE completeness END,updated_at=? WHERE release_id=?").bind(plan.target.id, new Date().toISOString(), plan.source.id), store.prepare('INSERT INTO owned_parts(entry_id,part_id,release_id,quantity,condition,defects) SELECT entry_id,part_id,?,quantity,condition,defects FROM merge_holdings WHERE operation_id=?').bind(plan.target.id, operationId), store.prepare('DELETE FROM merge_holdings WHERE operation_id=?').bind(operationId));
    for (const [oldId, newId] of ids)
        statements.push(store.prepare('UPDATE media_links SET part_id=? WHERE part_id=?').bind(newId, oldId));
    statements.push(store.prepare('UPDATE media_links SET release_id=? WHERE release_id=?').bind(plan.target.id, plan.source.id), store.prepare('UPDATE file_cards SET release_id=? WHERE release_id=?').bind(plan.target.id, plan.source.id));
    statements.push(store.prepare('INSERT OR IGNORE INTO release_taxonomy(release_id,taxonomy_id) SELECT ?,taxonomy_id FROM release_taxonomy WHERE release_id=?').bind(plan.target.id, plan.source.id), store.prepare('INSERT OR IGNORE INTO release_links(release_id,related_id,kind) SELECT ?,related_id,kind FROM release_links WHERE release_id=? AND related_id<>?').bind(plan.target.id, plan.source.id, plan.target.id), store.prepare('INSERT OR IGNORE INTO release_links(release_id,related_id,kind) SELECT release_id,?,kind FROM release_links WHERE related_id=? AND release_id<>?').bind(plan.target.id, plan.source.id, plan.target.id), store.prepare('DELETE FROM release_links WHERE release_id=? OR related_id=?').bind(plan.source.id, plan.source.id));
    const now = new Date().toISOString();
    statements.push(store.prepare('UPDATE catalog_releases SET retired=1,revision=revision+1,updated_at=? WHERE id=?').bind(now, plan.source.id), store.prepare('UPDATE catalog_releases SET revision=revision+1,updated_at=? WHERE id=?').bind(now, plan.target.id), store.prepare('INSERT INTO catalog_merges(source_id,target_id,mapping,created_at) VALUES(?,?,?,?)').bind(plan.source.id, plan.target.id, JSON.stringify(Object.fromEntries(ids)), now));
    for (const release of [plan.source, plan.target])
        statements.push(store.prepare('INSERT INTO catalog_revisions(release_id,revision,snapshot,actor_id,created_at) VALUES(?,?,?,?,?)').bind(release.id, release.revision + 1, JSON.stringify({ operation: 'merge', sourceId: plan.source.id, targetId: plan.target.id, mapping: Object.fromEntries(ids) }), a.id, now));
    statements.push(store.prepare('DELETE FROM operation_guards WHERE id=?').bind(operationId));
    try {
        await store.batch(statements);
    }
    catch (e) {
        if (String(e).includes('operation_must_be_current'))
            throw new AccessError(409, 'Release changed during merge. Preview again.');
        throw e;
    }
    return { ok: true, targetId: plan.target.id, impactedCopies: plan.impactedCopies };
}
