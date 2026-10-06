import { actor, json, failure, mutation, AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { limit, bodyJSON } from '@/lib/limits';
import { deleteAccount, resumeDeletion, deletionSubject } from '@/lib/account-deletion';
export async function GET(request: Request) { try {
    const a = await actor(request);
    const profile=await db().prepare('SELECT u.display_name,c.visibility,c.preferences FROM users u JOIN collections c ON c.user_id=u.id WHERE u.id=?').bind(a.id).first<{display_name:string;visibility:string;preferences:string}>();
    return json({ userId: a.id, collectionId: a.collectionId, role: a.isAdmin ? 'admin' : 'collector', displayName:profile?.display_name,visibility:profile?.visibility,needsSetup:!JSON.parse(profile?.preferences??'{}').setup, identity: { provider: 'chatgpt', subject: request.headers.get('oai-authenticated-user-id')?.trim() } });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: Request) { try {
  mutation(request); const body=await bodyJSON(request);
  if(body.action==='resumeDeletion') return json(await resumeDeletion(await deletionSubject(request)));
  const a=await actor(request); await limit(a.id,'account-write',30,60);
  if(body.action==='delete') {
    if(body.confirmation!=='DELETE MY ACCOUNT') throw new AccessError(400,'Type DELETE MY ACCOUNT to confirm.');
    return json(await deleteAccount(a));
  }
  if(body.action!=='profile' || typeof body.displayName!=='string' || !body.displayName.trim() || body.displayName.trim().length>80 || /[\u0000-\u001f]/.test(body.displayName) || !['private','public'].includes(body.visibility)) throw new AccessError(400,'Use a display name of 1–80 characters and valid visibility.');
  await db().batch([
    db().prepare('UPDATE users SET display_name=? WHERE id=? AND deleted_at IS NULL').bind(body.displayName.trim(),a.id),
    db().prepare("UPDATE collections SET visibility=?,preferences=json_set(preferences,'$.setup',json('true')),updated_at=? WHERE id=? AND user_id=?").bind(body.visibility,new Date().toISOString(),a.collectionId,a.id),
  ]); return json({ok:true});
} catch(e) { return failure(e); } }
