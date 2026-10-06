import { administrator,mutation,json,failure,AccessError } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { bodyJSON,limit } from '@/lib/limits';
export async function GET() { try{return json({terms:(await db().prepare('SELECT * FROM taxonomy ORDER BY kind,name,id').all()).results});}catch(e){return failure(e);} }
export async function POST(request:Request){try{
  mutation(request);const a=await administrator(request);await limit(a.id,'taxonomy',60,60);const b=await bodyJSON(request);
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>200||!['line','series','sub_series','wave','scale','faction','market','manufacturer','other'].includes(b.kind)||b.id!==undefined&&(typeof b.id!=='string'||b.id.length>128))throw new AccessError(400,'Invalid taxonomy term.');
  const id=b.id??crypto.randomUUID();let parent=b.parentId??null;const visited=new Set([id]);
  while(parent){if(typeof parent!=='string'||visited.has(parent))throw new AccessError(400,'Taxonomy cannot contain cycles.');visited.add(parent);const row=await db().prepare('SELECT parent_id FROM taxonomy WHERE id=?').bind(parent).first<{parent_id:string|null}>();if(!row)throw new AccessError(400,'Unknown parent.');parent=row.parent_id;}
  await db().prepare('INSERT INTO taxonomy(id,kind,name,parent_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,parent_id=excluded.parent_id').bind(id,b.kind,b.name.trim(),b.parentId??null).run();return json({id});
}catch(e){return failure(e);} }
