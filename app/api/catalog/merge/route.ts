import { administrator,mutation,json,failure } from '@/lib/auth/access';
import { mergePlan,mergeReleases } from '@/lib/catalog-merge';
import { bodyJSON,limit } from '@/lib/limits';
export async function POST(request:Request){try{mutation(request);const a=await administrator(request);await limit(a.id,'catalog-merge',20,3600);const b=await bodyJSON(request);return json(b.action==='preview'?await mergePlan(b):await mergeReleases(a,b));}catch(e){return failure(e);} }
