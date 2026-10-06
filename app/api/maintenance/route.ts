import { administrator,mutation,json,failure } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { resumeDeletion,reapplyDeletionLedger } from '@/lib/account-deletion';
import { bodyJSON } from '@/lib/limits';
export async function POST(request:Request){try{mutation(request);await administrator(request);const body=await bodyJSON(request);if(body.action==='reapplyDeletions')return json(await reapplyDeletionLedger(body.cursor));const jobs=await db().prepare("SELECT user_id FROM deletion_jobs WHERE state='pending' ORDER BY updated_at LIMIT 5").all<{user_id:string}>();let completed=0;for(const job of jobs.results){const result=await resumeDeletion(job.user_id);if(result.cleanup==='complete')completed++;}return json({processed:jobs.results.length,completed});}catch(e){return failure(e);} }
