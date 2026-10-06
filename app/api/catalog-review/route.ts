import {db,sameOrigin} from '@/lib/db';
import {ownerWriteError} from '@/lib/owner-access';
import {coverageCount} from '@/lib/catalog-reliability';
import catalog from '@/lib/catalog';
export async function GET(r:Request){const denied=ownerWriteError(r);if(denied)return denied;try{const [issues,checks]=await Promise.all([db().prepare('SELECT data FROM catalog_issues').all(),db().prepare('SELECT data FROM catalog_checks').all()]);return Response.json({issues:issues.results.map((x:any)=>JSON.parse(x.data)),checks:checks.results.map((x:any)=>JSON.parse(x.data))});}catch(e){console.error('Catalog review storage',e);return Response.json({error:'Catalog reviews could not be loaded. Retry shortly.'},{status:503});}}
export async function POST(r:Request){const denied=ownerWriteError(r);if(denied)return denied;if(!sameOrigin(r))return Response.json({error:'Unverified request'},{status:403});try{const body=await r.json() as any;
 if(body.action==='issue'){
  const x=body.issue;if(!x||!['Missing release','Missing part','Wrong image','Duplicate','Incorrect identity','Source conflict','Other'].includes(x.type)||typeof x.details!=='string'||!x.details.trim()||x.details.length>6000||x.photos?.length>30||x.photos?.some((p:any)=>typeof p!=='string'||!p.startsWith('/api/photo?')))throw Error('Invalid issue');
  if(x.source){const url=new URL(x.source);if(!['https:','http:'].includes(url.protocol))throw Error('Invalid source');}const issue={...x,id:crypto.randomUUID(),status:'Open',created:new Date().toISOString()};await db().prepare('INSERT INTO catalog_issues(id,data) VALUES (?,?)').bind(issue.id,JSON.stringify(issue)).run();return Response.json({issue});
 }
 if(body.action==='review'){
  const old=await db().prepare('SELECT data FROM catalog_issues WHERE id=?').bind(body.id).first();if(['Resolved','Distinct releases'].includes(body.status)&&!body.note?.trim())throw Error('Resolution evidence required');if(!old||!['Open','Investigating','Resolved','Distinct releases'].includes(body.status)||typeof body.note!=='string'||body.note.length>6000)throw Error('Invalid review');
  const issue={...JSON.parse(old.data),status:body.status,reviewNote:body.note,reviewed:new Date().toISOString()};await db().prepare('UPDATE catalog_issues SET data=? WHERE id=?').bind(JSON.stringify(issue),issue.id).run();return Response.json({issue});
 }
 if(body.action==='check'){
  const x=body.check;const u=new URL(x.source);if(!['https:','http:'].includes(u.protocol)||!Number.isInteger(x.expected)||x.expected<0||x.expected>10000||!catalog.some(r=>r.line===x.line)||!Number.isInteger(x.year)||!x.note?.trim()||x.note.length>6000||!['Needs review','Reconciled'].includes(x.status))throw Error('Invalid coverage check');
  if(!['All catalog items','Figure versions','Retail packages and vehicles'].includes(x.basis))throw Error('Invalid counting basis');const count=coverageCount(catalog,x);if(x.status==='Reconciled'&&x.expected!==count)throw Error('Counts do not reconcile');const check={...x,id:crypto.randomUUID(),checked:new Date().toISOString(),catalogCount:count};await db().prepare('INSERT INTO catalog_checks(id,data) VALUES (?,?)').bind(check.id,JSON.stringify(check)).run();return Response.json({check});
 }throw Error('Unknown action');
 }catch(e){console.error('Catalog review save',e);return Response.json({error:'Review could not be saved. Check the fields and retry; your draft is kept.'},{status:400});}}
