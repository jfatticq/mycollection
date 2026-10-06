import { json,failure,AccessError } from '@/lib/auth/access';
import { deletionSubject } from '@/lib/account-deletion';
import { db } from '@/lib/db';
export async function GET(request:Request){try{const id=await deletionSubject(request);const row=await db().prepare('SELECT state FROM deletion_jobs WHERE user_id=?').bind(id).first<{state:string}>();if(!row)throw new AccessError(404,'No deletion request.');return json({deleted:true,cleanup:row.state==='complete'?'complete':'pending'});}catch(e){return failure(e);} }
