import { administrator,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
export async function GET(request:Request){try{await administrator(request);const id=new URL(request.url).searchParams.get('id');if(!id)throw new AccessError(400,'Release ID required.');const rows=await db().prepare('SELECT revision,snapshot,created_at FROM catalog_revisions WHERE release_id=? ORDER BY revision DESC').bind(id).all();return json({revisions:rows.results});}catch(e){return failure(e);} }
