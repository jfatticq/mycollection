import { actor,mutation,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { limit } from '@/lib/limits';
import { input,text,id,page,writable,thread,activeWriter,requestId } from '@/lib/discussions';
export async function GET(request:Request){try{
  const a=await actor(request),url=new URL(request.url),threadId=url.searchParams.get('thread'),offset=page(url.searchParams.get('offset'));
  const restricted=!!await db().prepare('SELECT user_id FROM discussion_restrictions WHERE user_id=?').bind(a.id).first();
  if(threadId){const t=await thread(id(threadId));
    const posts=(await db().prepare(`SELECT p.id,p.thread_id,p.author_id,p.state,p.version,p.created_at,p.edited_at,
      CASE WHEN p.state='visible' AND u.deleted_at IS NULL THEN p.body ELSE '' END AS body,
      CASE WHEN u.deleted_at IS NULL THEN u.display_name ELSE 'Deleted collector' END AS display_name,
      CASE WHEN p.author_id=? THEN 1 ELSE 0 END AS mine FROM discussion_posts p JOIN users u ON u.id=p.author_id WHERE p.thread_id=? ORDER BY p.created_at,p.rowid LIMIT 51 OFFSET ?`).bind(a.id,t.id,offset).all()).results;
    const following=!!await db().prepare('SELECT user_id FROM discussion_follows WHERE user_id=? AND thread_id=?').bind(a.id,t.id).first();
    const count=await db().prepare('SELECT count(*) AS n FROM discussion_posts WHERE thread_id=?').bind(t.id).first<{n:number}>();
    return json({thread:t,posts:posts.slice(0,50),postCount:count?.n??0,hasNext:posts.length>50,following,restricted});
  }
  const release=url.searchParams.get('release');if(release)id(release);
  const q=(url.searchParams.get('q')??'').trim();if(q.length>200)throw new AccessError(400,'Search is too long.');
  const where=`WHERE (? IS NULL OR t.release_id=?) AND instr(lower(t.title),lower(?))>0`;
  const rows=(await db().prepare(`SELECT t.*,r.name AS release_name,
    (SELECT count(*) FROM discussion_posts p WHERE p.thread_id=t.id) AS post_count,
    CASE WHEN u.deleted_at IS NULL THEN u.display_name ELSE 'Deleted collector' END AS display_name
    FROM discussion_threads t JOIN users u ON u.id=t.author_id LEFT JOIN catalog_releases r ON r.id=t.release_id ${where} ORDER BY t.updated_at DESC,t.id LIMIT 25 OFFSET ?`).bind(release,release,q,offset).all()).results;
  const releaseRow=release?await db().prepare('SELECT id,name FROM catalog_releases WHERE id=?').bind(release).first():null;
  if(release&&!releaseRow)throw new AccessError(404,'Release not found.');
  return json({threads:rows.slice(0,24),hasNext:rows.length>24,release:releaseRow,restricted});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  mutation(request);const a=await actor(request);await writable(a);await limit(a.id,'discussion-create',10);const b=await input(request);
  const title=text(b.title,'Title',160),body=text(b.body,'Post',6000),releaseId=b.releaseId==null?null:id(b.releaseId);
  if(releaseId&&!await db().prepare('SELECT id FROM catalog_releases WHERE id=? AND retired=0').bind(releaseId).first())throw new AccessError(400,'Choose an active catalog release.');
  const threadId=requestId(b.requestId),postId=threadId,now=new Date().toISOString();
  const existing=await db().prepare('SELECT author_id,release_id FROM discussion_threads WHERE id=?').bind(threadId).first<any>();
  if(existing){if(existing.author_id!==a.id||existing.release_id!==releaseId)throw new AccessError(409,'Request identifier is already in use.');return json({id:threadId},201);}
  await db().batch([
    db().prepare(`INSERT INTO discussion_threads(id,release_id,author_id,title,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${activeWriter('?')}`).bind(threadId,releaseId,a.id,title,now,now,a.id,a.id),
    db().prepare(`INSERT INTO discussion_posts(id,thread_id,author_id,body,created_at) VALUES(?,?,?,?,?)`).bind(postId,threadId,a.id,body,now),
    db().prepare('INSERT INTO discussion_follows(user_id,thread_id,created_at) VALUES(?,?,?)').bind(a.id,threadId,now),
  ]);return json({id:threadId},201);
}catch(e){return failure(e);}}
