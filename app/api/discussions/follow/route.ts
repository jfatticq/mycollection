import {actor,mutation,json,failure,AccessError} from '@/lib/auth/access';
import {db} from '@/lib/db';
import {limit} from '@/lib/limits';
import {input,id,thread} from '@/lib/discussions';
export async function POST(request:Request){try{mutation(request);const a=await actor(request);await limit(a.id,'discussion-follow',60);const b=await input(request),t=await thread(id(b.threadId));if(typeof b.follow!=='boolean')throw new AccessError(400,'Choose follow or unfollow.');
 if(b.follow){const count=await db().prepare('SELECT count(*) AS n FROM discussion_follows WHERE user_id=?').bind(a.id).first<{n:number}>();if((count?.n??0)>=200)throw new AccessError(400,'You can follow up to 200 threads. Unfollow a thread first.');await db().prepare(`INSERT INTO discussion_follows(user_id,thread_id,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL) ON CONFLICT(user_id,thread_id) DO NOTHING`).bind(a.id,t.id,new Date().toISOString(),a.id).run();}
 else await db().prepare('DELETE FROM discussion_follows WHERE user_id=? AND thread_id=?').bind(a.id,t.id).run();return json({following:b.follow});
}catch(e){return failure(e);}}
