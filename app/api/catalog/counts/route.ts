import { actor,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
export async function GET(request:Request) { try {
  await actor(request);const id=new URL(request.url).searchParams.get('id');if(!id)throw new AccessError(400,'Release ID required.');
  const rows=await db().prepare('SELECT e.ownership,c.visibility,COUNT(*) AS total,COUNT(DISTINCT c.user_id) AS collectors FROM owned_entries e JOIN collections c ON c.id=e.collection_id JOIN users u ON u.id=c.user_id WHERE e.release_id=? AND u.deleted_at IS NULL GROUP BY e.ownership,c.visibility').bind(id).all();
  const distinct=await db().prepare('SELECT e.ownership,COUNT(DISTINCT c.user_id) AS collectors FROM owned_entries e JOIN collections c ON c.id=e.collection_id JOIN users u ON u.id=c.user_id WHERE e.release_id=? AND u.deleted_at IS NULL GROUP BY e.ownership').bind(id).all();
  return json({counts:rows.results,distinctCollectors:distinct.results});
} catch(e){return failure(e);} }
