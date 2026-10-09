import { actor,mutation,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { limit } from '@/lib/limits';
import { input,text,id,version,writable,thread,activeWriter,ensureChanged,requestId } from '@/lib/discussions';
export async function POST(request:Request){try{
  mutation(request);const a=await actor(request);await writable(a);await limit(a.id,'discussion-post',60);const b=await input(request),now=new Date().toISOString();
  if(b.action==='reply'){
    const t=await thread(id(b.threadId));if(t.locked)throw new AccessError(409,'This thread is locked.');
    const body=text(b.body,'Reply',6000),postId=requestId(b.requestId);
    const existing=await db().prepare('SELECT author_id,thread_id FROM discussion_posts WHERE id=?').bind(postId).first<any>();
    if(existing){if(existing.author_id!==a.id||existing.thread_id!==t.id)throw new AccessError(409,'Request identifier is already in use.');return json({id:postId},201);}
    const results=await db().batch([
      db().prepare(`INSERT INTO discussion_posts(id,thread_id,author_id,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM discussion_threads WHERE id=? AND locked=0) AND ${activeWriter('?')}`).bind(postId,t.id,a.id,body,now,t.id,a.id,a.id),
      db().prepare('UPDATE discussion_threads SET updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM discussion_posts WHERE id=?)').bind(now,t.id,postId),
      db().prepare(`INSERT INTO discussion_notifications(user_id,post_id,thread_id,created_at) SELECT f.user_id,?,?,? FROM discussion_follows f JOIN users u ON u.id=f.user_id WHERE f.thread_id=? AND f.user_id<>? AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM discussion_posts WHERE id=?)`).bind(postId,t.id,now,t.id,a.id,postId),
    ]);await ensureChanged(results[0]);return json({id:postId},201);
  }
  const postId=id(b.postId),v=version(b.version),p=await db().prepare('SELECT * FROM discussion_posts WHERE id=? AND author_id=?').bind(postId,a.id).first<any>();
  if(!p)throw new AccessError(404,'Post not found.');if(p.state!=='visible')throw new AccessError(409,'This post cannot be changed.');
  const t=await thread(p.thread_id);if(t.locked)throw new AccessError(409,'This thread is locked.');
  if(!['edit','remove'].includes(b.action))throw new AccessError(400,'Unknown action.');
  const body=b.action==='edit'?text(b.body,'Post',6000):'';
  const guard=`id=? AND author_id=? AND version=? AND state='visible' AND EXISTS(SELECT 1 FROM discussion_threads WHERE id=discussion_posts.thread_id AND locked=0) AND ${activeWriter('?')}`;
  const statements=b.action==='edit'?[db().prepare(`INSERT INTO discussion_revisions(post_id,version,body,created_at) SELECT id,version,body,? FROM discussion_posts WHERE ${guard}`).bind(now,postId,a.id,v,a.id,a.id)]:[];
  statements.push(db().prepare(`UPDATE discussion_posts SET body=?,state=?,version=version+1,edited_at=? WHERE ${guard}`).bind(body,b.action==='edit'?'visible':'removed',now,postId,a.id,v,a.id,a.id));
  if(b.action==='remove')statements.push(db().prepare("DELETE FROM discussion_revisions WHERE post_id=? AND EXISTS(SELECT 1 FROM discussion_posts WHERE id=? AND state='removed')").bind(postId,postId));
  const results=await db().batch(statements);await ensureChanged(results[b.action==='edit'?1:0]);return json({ok:true});
}catch(e){return failure(e);}}
