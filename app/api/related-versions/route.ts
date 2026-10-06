import catalog,{canonicalId} from '@/lib/catalog';
import inventories from '@/lib/accessory-snapshots.json';
import sources from '@/lib/accessory-sources.json';
import {identityFor} from '@/lib/catalog-reliability';
import {archiveFigureURL,parseVersions} from '@/lib/source-versions';
import {bucket} from '@/lib/db';
import {ownerWriteError} from '@/lib/owner-access';
export async function GET(request:Request){const denied=ownerWriteError(request);if(denied)return denied;const id=canonicalId(new URL(request.url).searchParams.get('id')||'');const release=catalog.find(r=>r.id===id);if(!release)return Response.json({error:'Unknown release'},{status:404});
 const url=archiveFigureURL((sources as Record<string,any>)[id]?.url||(inventories as Record<string,any>)[id]?.source||release.accessoryUrl||release.url);if(!url)return Response.json({error:'No exact YoJoe figure mapping is recorded for this entry. Report a source link for review.'},{status:422});
 try{const key='version-audits/v1/'+id,store=bucket(),old=await store.get(key);let snapshot=old?JSON.parse(await old.text()):null;
  if(!snapshot||Date.now()-new Date(snapshot.checked).getTime()>86400000){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Archive unavailable');const html=await response.text();if(html.length>2000000)throw Error('Archive too large');const versions=parseVersions(html);if(!versions.length)throw Error('Archive version index unavailable');snapshot={source:url,checked:new Date().toISOString(),versions};await store.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});}
  const versions=snapshot.versions.map((version:any)=>{const match=catalog.find(r=>identityFor(r).entityType==='figure'&&(r.url===version.url||(sources as Record<string,any>)[r.id]?.url===version.url||(inventories as Record<string,any>)[r.id]?.source===version.url));return {...version,releaseId:match?.id||null,status:match?'Represented':'Not linked in catalog'};});
  return Response.json({...snapshot,versions,note:'Exact archive links only. An unlinked version may be absent or present under an unverified mapping. This archive family index does not establish complete worldwide coverage.'});
 }catch(e){console.error('Archive version audit',id);return Response.json({error:'Version index could not be checked. Your collection is unchanged; retry later.'},{status:503});}}
