// Temporary release-only worker hook. Not imported by the final application.
// Storage names are the existing Site's logical, project-scoped bindings.
const projectId = 'appgprj_6ac1cede871881919ac1c3b25bf1a6c5';
const legacy = ['items', 'settings', 'catalog_issues', 'catalog_checks'];
const target = ['catalog_parts','catalog_releases','catalog_revisions','collections','file_cards','identities','media','media_links','owned_entries','owned_parts','release_links','release_taxonomy','taxonomy','unidentified_parts','user_roles','users','catalog_merges','deletion_jobs','import_runs','rate_limits','merge_holdings','operation_guards'];
const cleared = 'step5:legacy-cleared';
const complete = 'step5:reset-complete';
type MigrationEnv = Cloudflare.Env & { MIGRATION_RESET_TOKEN?: string };
const response = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'private, no-store'}});
export async function migrationResponse(request: Request, env: MigrationEnv): Promise<Response | undefined> {
  if (!env.MIGRATION_RESET_TOKEN) return;
  // Freeze every application read/write; the dispatcher still owns authentication.
  if (new URL(request.url).pathname !== '/__migration/step5') return response({error:'The collection site is undergoing its planned migration. Please return shortly.'},503);
  if (request.method !== 'POST' || request.headers.get('Authorization') !== 'Bearer '+env.MIGRATION_RESET_TOKEN) return response({error:'Unavailable'},404);
  try {
    if (!env.DB || !env.BUCKET) throw Error('Required storage bindings unavailable');
    const body = await request.json() as {project_id?:string;d1?:string;r2?:string;action?:string};
    if (body.project_id !== projectId || body.d1 !== 'DB' || body.r2 !== 'BUCKET') return response({error:'Storage target confirmation does not match.'},409);
    const db = env.DB, bucket = env.BUCKET;
    const tables = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all<{name:string;sql:string}>();
    // This exact Sites migration ledger was verified from the live schema diagnostic.
    const actual = tables.results.map(t=>t.name).filter(n=>!n.startsWith('sqlite_')&&!n.startsWith('_cf_')&&!['d1_migrations','__drizzle_migrations','__appgarden_migrations'].includes(n));
    const missing = [...legacy,...target].filter(n=>!actual.includes(n));
    const unexpected = actual.filter(n=>![...legacy,...target].includes(n));
    if (missing.length || unexpected.length) return response({error:'Unexpected application schema; reset refused',missing,unexpected:tables.results.filter(t=>unexpected.includes(t.name))},409);
    const counts: Record<string,number> = {};
    for(const table of [...legacy,...target]) {
      const row = await db.prepare(`SELECT count(*) AS n FROM "${table}"${table==='operation_guards' ? " WHERE id NOT IN ('step5:legacy-cleared','step5:reset-complete')" : ''}`).first<{n:number}>();
      counts[table] = row!.n;
    }
    const finished = !!await db.prepare('SELECT id FROM operation_guards WHERE id=?').bind(complete).first();
    if (body.action === 'status') return response({project_id:projectId,d1:'DB',r2:'BUCKET',counts,complete:finished,filesEmpty:(await bucket.list({limit:1})).objects.length===0});
    if(finished) return response({error:'This one-time reset has already completed.'},409);
    if(target.some(n=>counts[n]!==0)) return response({error:'New application data exists; reset refused.'},409);
    if(body.action === 'clear') {
      if(!await db.prepare('SELECT id FROM operation_guards WHERE id=?').bind(cleared).first()) {
        await db.batch([
          db.prepare('INSERT INTO operation_guards(id,valid) VALUES(?,1)').bind(cleared),
          ...legacy.map(n=>db.prepare(`DELETE FROM "${n}"`)),
        ]);
      }
      // Re-list the first page after each deletion: no skipped keys/cursor races.
      const page = await bucket.list({limit:100});
      if(page.objects.length) await bucket.delete(page.objects.map(o=>o.key));
      return response({removedFiles:page.objects.length,filesEmpty:(await bucket.list({limit:1})).objects.length===0});
    }
    if(body.action === 'finalize') {
      if([...legacy,...target].some(n=>counts[n]!==0) || (await bucket.list({limit:1})).objects.length) return response({error:'Reset is not empty.'},409);
      await db.prepare('INSERT INTO operation_guards(id,valid) VALUES(?,1)').bind(complete).run();
      return response({complete:true,counts,filesEmpty:true});
    }
    return response({error:'Unknown migration action.'},400);
  } catch(e) {console.error('Controlled migration failed',e);return response({error:'Migration paused. Storage or schema verification failed.'},503);}
}
