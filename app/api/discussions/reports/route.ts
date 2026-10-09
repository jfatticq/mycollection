import {actor,mutation,json,failure,AccessError} from '@/lib/auth/access';
import {db} from '@/lib/db';
import {limit} from '@/lib/limits';
import {input,id,text,writable} from '@/lib/discussions';
export async function POST(request:Request){try{mutation(request);const a=await actor(request);await writable(a);await limit(a.id,'discussion-report',10);const b=await input(request),postId=id(b.postId),reason=text(b.reason,'Report reason',1000);
 if(!await db().prepare("SELECT id FROM discussion_posts WHERE id=? AND state='visible'").bind(postId).first())throw new AccessError(404,'Post not found.');
 await db().prepare('INSERT INTO discussion_reports(id,post_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id,reporter_id) DO NOTHING').bind(crypto.randomUUID(),postId,a.id,reason,new Date().toISOString()).run();return json({ok:true});
}catch(e){return failure(e);}}
