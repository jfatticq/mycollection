import { actor,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
export async function GET(request:Request) { try {
  await actor(request); const p=new URL(request.url).searchParams;
  const offset=Number(p.get('offset')??0);if(!Number.isInteger(offset)||offset<0)throw new AccessError(400,'Invalid page.');
  const rows=await db().prepare("SELECT c.id,u.display_name,COUNT(e.id) AS records FROM collections c JOIN users u ON u.id=c.user_id LEFT JOIN owned_entries e ON e.collection_id=c.id WHERE c.visibility='public' AND u.deleted_at IS NULL AND u.display_name LIKE ? GROUP BY c.id,u.display_name ORDER BY u.display_name,c.id LIMIT 48 OFFSET ?").bind('%'+(p.get('q')??'').slice(0,80)+'%',offset).all();
  return json({collections:rows.results});
} catch(e){return failure(e);} }
