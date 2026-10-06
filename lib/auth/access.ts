import { env } from 'cloudflare:workers';
import { db, sameOrigin } from '@/lib/db';
export class AccessError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export type Actor = {
    id: string;
    collectionId: string;
    isAdmin: boolean;
};
export const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization, oai-authenticated-user-id' };
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: privateHeaders }); }
export function failure(e: unknown) {
    if (e instanceof AccessError)
        return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError)
        return json({ error: "Invalid request body." }, 400);
    console.error('Application request failed', e);
    return json({ error: 'Storage is unavailable. Please retry.' }, 503);
}
export function mutation(request: Request) { if (!sameOrigin(request))
    throw new AccessError(403, 'Unverified request origin.'); }
export async function subjectUserId(subject: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('chatgpt:' + subject));
    return 'user_' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function actor(request: Request): Promise<Actor> {
    const subject = request.headers.get('oai-authenticated-user-id')?.trim();
    if (!subject || subject.length > 512)
        throw new AccessError(401, 'Sign in to access your collection.');
    const store = db();
    let identity = await store.prepare(`SELECT u.id, u.deleted_at FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider='chatgpt' AND i.subject=?`).bind(subject).first<{
        id: string;
        deleted_at: string | null;
    }>();
    if (!identity) {
        // Concurrent first requests converge without granting the first registrant a role.
        const id = await subjectUserId(subject);
        if (await store.prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NOT NULL').bind(id).first())
            throw new AccessError(403, 'This account has been deleted.');
        const now = new Date().toISOString();
        await store.batch([
            store.prepare('INSERT INTO users(id,display_name,email,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, 'Collector', request.headers.get('oai-authenticated-user-email'), now),
            store.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('chatgpt',?,?) ON CONFLICT(provider,subject) DO NOTHING").bind(subject, id),
            store.prepare('INSERT INTO collections(id,user_id,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind('collection_' + id, id, now, now),
        ]);
        identity = await store.prepare(`SELECT u.id,u.deleted_at FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider='chatgpt' AND i.subject=?`).bind(subject).first<{
            id: string;
            deleted_at: string | null;
        }>();
    }
    if (!identity || identity.deleted_at)
        throw new AccessError(403, 'This account is unavailable.');
    if (env.ADMIN_CHATGPT_SUBJECT && subject === env.ADMIN_CHATGPT_SUBJECT) {
        await store.prepare("INSERT INTO user_roles(user_id,role,granted_at,granted_by) VALUES(?,'admin',?,'configured-sites-subject') ON CONFLICT(user_id,role) DO NOTHING").bind(identity.id, new Date().toISOString()).run();
    }
    const collection = await store.prepare('SELECT id FROM collections WHERE user_id=?').bind(identity.id).first<{
        id: string;
    }>();
    if (!collection)
        throw new Error('Collection provisioning failed');
    const role = await store.prepare("SELECT user_id FROM user_roles WHERE user_id=? AND role='admin'").bind(identity.id).first();
    return { id: identity.id, collectionId: collection.id, isAdmin: !!role };
}
export async function administrator(request: Request) { const a = await actor(request); if (!a.isAdmin)
    throw new AccessError(403, 'Only the catalog administrator can make this change.'); return a; }
export async function readableCollection(a: Actor, id: string) {
    const row = await db().prepare(`SELECT c.*,u.display_name FROM collections c JOIN users u ON u.id=c.user_id WHERE c.id=? AND u.deleted_at IS NULL AND (c.user_id=? OR c.visibility='public')`).bind(id, a.id).first<Record<string, unknown>>();
    if (!row)
        throw new AccessError(404, 'Collection not found.');
    return row;
}
