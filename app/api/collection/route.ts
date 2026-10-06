import { db } from '@/lib/db';
import { actor, mutation, readableCollection, json, failure, AccessError } from '@/lib/auth/access';
import { entries, saveEntry } from '@/lib/collection/store';
import { limit, bodyJSON } from '@/lib/limits';
export async function GET(request: Request) { try {
    const a = await actor(request);
    const id = new URL(request.url).searchParams.get('collectionId') || a.collectionId;
    const collection = await readableCollection(a, id);
    const own = collection.user_id === a.id;
    return json({ canEdit: own, access: { status: own ? 'owner' : 'viewer' }, collection: { id, visibility: collection.visibility, displayName: collection.display_name }, items: await entries(id, own), ...(own ? { scope: (() => { const p = JSON.parse(String(collection.preferences)); return Array.isArray(p.lines) && Array.isArray(p.years) ? p : null; })() } : {}) });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: Request) {
    try {
        mutation(request);
        const a = await actor(request);
        await limit(a.id, 'collection-write', 120, 60);
        const body = await bodyJSON(request) as any;
        if (body.action === 'save')
            return json({ item: await saveEntry(a, body.item) });
        if (body.action === 'delete') {
            const id = body.item?.id;
            if (typeof id !== 'string')
                throw new AccessError(400, 'Entry ID required.');
            const result = await db().prepare('DELETE FROM owned_entries WHERE id=? AND collection_id=?').bind(id, a.collectionId).run();
            if (!result.meta.changes)
                throw new AccessError(404, 'Entry not found.');
            return json({ ok: true });
        }
        if (body.action === 'visibility') {
            if (!['private', 'public'].includes(body.visibility))
                throw new AccessError(400, 'Invalid visibility.');
            await db().prepare('UPDATE collections SET visibility=?,updated_at=? WHERE id=? AND user_id=?').bind(body.visibility, new Date().toISOString(), a.collectionId, a.id).run();
            return json({ ok: true });
        }
        if (body.action === 'scope') {
            if (!body.scope || !Array.isArray(body.scope.lines) || !Array.isArray(body.scope.years) || JSON.stringify(body.scope).length > 10000)
                throw new AccessError(400, 'Invalid preferences.');
            await db().prepare('UPDATE collections SET preferences=?,updated_at=? WHERE id=? AND user_id=?').bind(JSON.stringify(body.scope), new Date().toISOString(), a.collectionId, a.id).run();
            return json({ ok: true });
        }
        throw new AccessError(400, 'Unknown action.');
    }
    catch (e) {
        return failure(e);
    }
}
