import {administrator,mutation,json,failure,AccessError} from '@/lib/auth/access';
import {db} from '@/lib/db';
import {limit} from '@/lib/limits';
import {input,id,text,version,page,thread,ensureChanged} from '@/lib/discussions';
export async function GET(request:Request){try{await administrator(request);const url=new URL(request.url),postId=url.searchParams.get('post');
 if(postId){const p=await db().prepare('SELECT * FROM discussion_posts WHERE id=?').bind(id(postId)).first();if(!p)throw new AccessError(404,'Post not found.');return json({post:p,revisions:(await db().prepare('SELECT version,body,created_at FROM discussion_revisions WHERE post_id=? ORDER BY version DESC LIMIT 50').bind(postId).all()).results});}
 const offset=page(url.searchParams.get('offset'));
 const reports=(await db().prepare(`SELECT x.*,p.thread_id,p.state,p.version,p.author_id,CASE WHEN p.state='removed' THEN '' ELSE p.body END AS body,t.title,u.display_name FROM discussion_reports x JOIN discussion_posts p ON p.id=x.post_id JOIN discussion_threads t ON t.id=p.thread_id JOIN users u ON u.id=x.reporter_id WHERE x.resolved=0 ORDER BY x.created_at,x.id LIMIT 25 OFFSET ?`).bind(offset).all()).results;
 return json({reports:reports.slice(0,24),hasNext:reports.length>24,restrictions:(await db().prepare('SELECT x.user_id,u.display_name,x.created_at FROM discussion_restrictions x JOIN users u ON u.id=x.user_id ORDER BY x.created_at DESC LIMIT 200').all()).results,audit:(await db().prepare('SELECT action,target_id,reason,created_at FROM discussion_moderation ORDER BY created_at DESC,id LIMIT 50').all()).results});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{mutation(request);const a=await administrator(request);await limit(a.id,'discussion-moderate',60,60);const b=await input(request),target=id(b.targetId),reason=text(b.reason,'Moderation reason',1000),now=new Date().toISOString();
 const statements:D1PreparedStatement[]=[];
 if(['hide','restore'].includes(b.action)){
   const p=await db().prepare('SELECT p.*,u.deleted_at FROM discussion_posts p JOIN users u ON u.id=p.author_id WHERE p.id=?').bind(target).first<any>();if(!p)throw new AccessError(404,'Post not found.');if(p.state==='removed'||p.deleted_at)throw new AccessError(409,'Removed posts cannot be restored.');
   statements.push(db().prepare("UPDATE discussion_posts SET state=?,version=version+1 WHERE id=? AND version=? AND state<>'removed' AND EXISTS(SELECT 1 FROM users WHERE id=discussion_posts.author_id AND deleted_at IS NULL)").bind(b.action==='hide'?'hidden':'visible',target,version(b.version)));
 }else if(b.action==='rename'){
   await thread(target);statements.push(db().prepare('UPDATE discussion_threads SET title=?,version=version+1 WHERE id=? AND version=?').bind(text(b.title,'Title',160),target,version(b.version)));
 }else if(['lock','unlock'].includes(b.action)){
   await thread(target);statements.push(db().prepare('UPDATE discussion_threads SET locked=?,version=version+1 WHERE id=? AND version=?').bind(b.action==='lock'?1:0,target,version(b.version)));
 }else if(['restrict','unrestrict'].includes(b.action)){
   const u=await db().prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NULL').bind(target).first();if(!u)throw new AccessError(404,'Collector not found.');if(await db().prepare("SELECT user_id FROM user_roles WHERE user_id=? AND role='admin'").bind(target).first())throw new AccessError(400,'The catalog administrator cannot be restricted.');
   statements.push(b.action==='restrict'?db().prepare('INSERT INTO discussion_restrictions(user_id,created_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET created_at=excluded.created_at').bind(target,now):db().prepare('DELETE FROM discussion_restrictions WHERE user_id=?').bind(target));
 }else if(b.action==='resolve'){
   statements.push(db().prepare('UPDATE discussion_reports SET resolved=1 WHERE id=? AND resolved=0').bind(target));
 }else throw new AccessError(400,'Unknown moderation action.');
 // The audit uses changes() from the immediately preceding mutation; failed stale actions produce no audit row.
 statements.push(db().prepare('INSERT INTO discussion_moderation(id,actor_id,target_id,action,reason,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),a.id,target,b.action,reason,now));
 const results=await db().batch(statements);await ensureChanged(results[0]);return json({ok:true});
}catch(e){return failure(e);}}
