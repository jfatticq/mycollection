import { db, bucket } from '@/lib/db';
import { Actor, AccessError, subjectUserId } from '@/lib/auth/access';
export async function resumeDeletion(userId: string) {
    const job = await db().prepare('SELECT remaining_keys FROM deletion_jobs WHERE user_id=?').bind(userId).first<{
        remaining_keys: string;
    }>();
    if (!job)
        throw new AccessError(404, 'Deletion request not found.');
    // Keep a minimal deletion ledger outside D1 so a database restore cannot erase it.
    const deleted=await db().prepare('SELECT deleted_at FROM users WHERE id=?').bind(userId).first<{deleted_at:string|null}>();
    try{await bucket().put('deletions/'+userId+'.json',JSON.stringify({userId,deletedAt:deleted?.deleted_at??new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});}catch{return {deleted:true,cleanup:'pending'};}
    const keys: string[] = JSON.parse(job.remaining_keys);
    // Metadata is already revoked. Keep the remaining keys durably until R2 confirms removal.
    let processed = 0;
    while (keys.length && processed++ < 20) {
        try {
            await bucket().delete(keys[0]);
        }
        catch {
            return { deleted: true, cleanup: 'pending' };
        }
        keys.shift();
        await db().prepare('UPDATE deletion_jobs SET remaining_keys=?,updated_at=? WHERE user_id=?').bind(JSON.stringify(keys), new Date().toISOString(), userId).run();
    }
    if (keys.length)
        return { deleted: true, cleanup: 'pending' };
    // Also collect namespace orphans left by interrupted uploads with no metadata row.
    try{const orphans=await bucket().list({prefix:'collections/collection_'+userId+'/',limit:20});if(orphans.objects.length){await db().prepare("UPDATE deletion_jobs SET remaining_keys=?,state='pending',updated_at=? WHERE user_id=?").bind(JSON.stringify(orphans.objects.map(o=>o.key)),new Date().toISOString(),userId).run();return {deleted:true,cleanup:'pending'};}}catch{return {deleted:true,cleanup:'pending'};}
    await db().prepare("UPDATE deletion_jobs SET state='complete',updated_at=? WHERE user_id=?").bind(new Date().toISOString(), userId).run();
    return { deleted: true, cleanup: 'complete' };
}
export async function deleteAccount(a: Actor, deletedAt?:string) {
    const store = db(), now = deletedAt??new Date().toISOString();
    await store.batch([
        store.prepare("INSERT INTO users(id,display_name,created_at) VALUES('system_catalog','Catalog archive',?) ON CONFLICT(id) DO NOTHING").bind(now),
        store.prepare("UPDATE media SET owner_id='system_catalog' WHERE owner_id=? AND scope='catalog'").bind(a.id),
        store.prepare("INSERT INTO deletion_jobs(user_id,remaining_keys,state,updated_at) SELECT ?,COALESCE((SELECT json_group_array(object_key) FROM media WHERE owner_id=? AND scope='collection'),'[]'),'pending',? ON CONFLICT(user_id) DO NOTHING").bind(a.id,a.id,now),
        store.prepare("UPDATE users SET email=NULL,display_name='Deleted collector',deleted_at=? WHERE id=?").bind(now, a.id),
        store.prepare('DELETE FROM identities WHERE user_id=?').bind(a.id),
        store.prepare('DELETE FROM user_roles WHERE user_id=?').bind(a.id),
        store.prepare('DELETE FROM import_runs WHERE user_id=?').bind(a.id),
        store.prepare('DELETE FROM collections WHERE user_id=?').bind(a.id),
        store.prepare('DELETE FROM rate_limits WHERE key LIKE ?').bind(a.id + ':%'),
    ]);
    return resumeDeletion(a.id);
}
export async function deletionSubject(request: Request) {
    const subject = request.headers.get('oai-authenticated-user-id')?.trim();
    if (!subject || subject.length > 512)
        throw new AccessError(401, 'Sign in first.');
    return subjectUserId(subject);
}
export async function reapplyDeletionLedger(cursor?:string){
  const page=await bucket().list({prefix:'deletions/',limit:20,...(cursor?{cursor}:{})});let applied=0;
  for(const object of page.objects){const file=await bucket().get(object.key);if(!file)continue;const record=JSON.parse(await file.text());if(typeof record.userId!=='string'||!/^user_[a-f0-9]{64}$/.test(record.userId))throw Error('Invalid deletion ledger.');
    const collection=await db().prepare('SELECT id FROM collections WHERE user_id=?').bind(record.userId).first<{id:string}>();
    const user=await db().prepare('SELECT id FROM users WHERE id=?').bind(record.userId).first();
    if(!user)await db().prepare("INSERT INTO users(id,display_name,deleted_at,created_at) VALUES(?,'Deleted collector',?,?)").bind(record.userId,record.deletedAt,record.deletedAt).run();
    if(collection){await db().prepare('DELETE FROM deletion_jobs WHERE user_id=?').bind(record.userId).run();await deleteAccount({id:record.userId,collectionId:collection.id,isAdmin:false},record.deletedAt);}
    else await db().batch([db().prepare("UPDATE users SET email=NULL,display_name='Deleted collector',deleted_at=? WHERE id=?").bind(record.deletedAt,record.userId),db().prepare('DELETE FROM identities WHERE user_id=?').bind(record.userId),db().prepare('DELETE FROM user_roles WHERE user_id=?').bind(record.userId)]);
    applied++;
  }
  return {applied,nextCursor:page.truncated?page.cursor:null};
}
