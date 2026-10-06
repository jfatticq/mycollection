// Exercise route handlers against real SQLite, not SQL-shaped in-memory mocks.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
sqlite.prepare('INSERT INTO items(id,data) VALUES(?,?)').run('legacy', '{"name":"untouched"}');
let failMediaWrite = false, failR2Delete=false, beforeBatch=null;
const database = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return statement.execute(); },
      execute() { if (failMediaWrite && sql.startsWith('INSERT INTO media(')) throw Error('Injected write failure'); const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: result.changes } }; },
    };
    return statement;
  },
  async batch(statements) { if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const objects = new Map();
const bucket = {
  async put(key, bytes, options) { objects.set(key, { body: bytes, httpMetadata: options.httpMetadata }); },
  async get(key) { const object=objects.get(key);return object?{...object,async text(){return typeof object.body==='string'?object.body:Buffer.from(object.body).toString('utf8');}}:null; },
  async list({prefix,limit=20}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false};},
  async delete(key) { if(failR2Delete)throw Error("R2 offline"); objects.delete(key); },
};
const env = { DB: database, BUCKET: bucket, ADMIN_CHATGPT_SUBJECT: 'admin-subject' };
const cache = new Map();
function moduleAt(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const req = name => {
    if (name === 'cloudflare:workers') return { env };
    let target = name.startsWith('@/') ? path.resolve(name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null;
    if (!target) return require(name);
    if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
    return moduleAt(target.endsWith('.ts') ? target : target + '.ts');
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: req, console, URL, Request, Response, Headers, File, TextEncoder, TextDecoder, Date, crypto: require('node:crypto').webcrypto });
  return exports;
}
const editor = moduleAt('lib/collection/editor.ts');
const collection = moduleAt('app/api/collection/route.ts'), catalog = moduleAt('app/api/catalog/route.ts');
const photo = moduleAt('app/api/photo/route.ts'), links = moduleAt('app/api/media/links/route.ts');
const audit = moduleAt('app/api/catalog-review/route.ts');
const account = moduleAt('app/api/account/route.ts'), auth = moduleAt('lib/auth/access.ts');
function request(route, subject, body, origin = 'https://test.example') {
  const headers = { ...(subject ? { 'oai-authenticated-user-id': subject, 'oai-authenticated-user-email': 'same-private-email@example.com' } : {}) };
  if (body !== undefined) Object.assign(headers, { origin, 'Content-Type': 'application/json' });
  return new Request('https://test.example' + route, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function post(route, subject, body, handler, status = 200) { const r = await handler.POST(request(route, subject, body)); assert.equal(r.status, status, await r.clone().text()); return r.json(); }
async function upload(subject, scope = 'collection', valid = true) {
  const form = new FormData(); form.set('scope', scope); form.set('file', new File([valid ? require('jpeg-js').encode({width:2,height:2,data:Buffer.alloc(16,255)},85).data : '<script>bad</script>'], 'test.jpg', { type: 'image/jpeg' }));
  return photo.POST(new Request('https://test.example/api/photo', { method: 'POST', headers: { origin: 'https://test.example', 'oai-authenticated-user-id': subject }, body: form }));
}
(async()=>{
 const transfer=moduleAt('app/api/transfer/route.ts'),taxonomy=moduleAt('app/api/taxonomy/route.ts'),counts=moduleAt('app/api/catalog/counts/route.ts'),collectors=moduleAt('app/api/collectors/route.ts'),merge=moduleAt('app/api/catalog/merge/route.ts'),maintenance=moduleAt('app/api/maintenance/route.ts'),deletionStatus=moduleAt('app/api/account/deletion/route.ts');
 const format=moduleAt('lib/transfer-format.ts'),limits=moduleAt('lib/limits.ts'),imageTools=moduleAt('lib/media/image.ts');
 const a=await auth.actor(request('/api/account','a')),b=await auth.actor(request('/api/account','b'));await auth.actor(request('/api/account','admin-subject'));
 assert.equal((await collectors.GET(request('/api/collectors'))).status,401);assert.equal((await counts.GET(request('/api/catalog/counts?id=release'))).status,401);
 await post('/api/account','a',{action:'profile',displayName:'Collector Alpha',visibility:'private'},account);
 await post('/api/account','b',{action:'profile',displayName:'Collector Bravo',visibility:'public'},account);
 const profile=await (await account.GET(request('/api/account','a'))).json();assert.equal(profile.needsSetup,false);assert.equal(profile.displayName,'Collector Alpha');assert(!JSON.stringify(profile).includes('same-private-email'));
 await post('/api/taxonomy','a',{name:'ARAH',kind:'line'},taxonomy,403);
 const term=await post('/api/taxonomy','admin-subject',{name:'ARAH',kind:'line'},taxonomy);const child=await post('/api/taxonomy','admin-subject',{name:'Series 1',kind:'series',parentId:term.id},taxonomy);
 await post('/api/taxonomy','admin-subject',{id:term.id,name:'ARAH',kind:'line',parentId:child.id},taxonomy,400);
 const release={id:'release',name:'Snow Job',kind:'figure',line:'A Real American Hero',year:1983,wave:'1',taxonomyIds:[term.id],parts:[{id:'figure',name:'Figure',kind:'primary',expectedQuantity:1},{id:'skis',name:'Skis',kind:'accessory',expectedQuantity:2}],fileCards:[{id:'card',text:'Plain text <script> is never executed.'}]};
 await post('/api/catalog','admin-subject',{release},catalog);
 assert.equal((await (await catalog.GET(request('/api/catalog?wave=1&taxonomyId='+term.id))).json()).total,1);
 assert.equal((await (await catalog.GET(request('/api/catalog?kind=vehicle'))).json()).total,0);
 assert.equal((await catalog.GET(request('/api/catalog?includeRetired=true','a'))).status,403);
 const first=(await post('/api/collection','a',{action:'save',item:{name:'First',releaseId:'release',ownership:'owned',notes:'PRIVATE ALPHA',location:'PRIVATE SHELF',purchasePriceCents:100,parts:[{partId:'figure',quantity:1},{partId:'skis',quantity:null}]}},collection)).item;
 await post('/api/collection','a',{action:'save',item:{name:'Second',releaseId:'release',ownership:'owned',parts:[{partId:'figure',quantity:1},{partId:'skis',quantity:0}]}},collection);
 await post('/api/collection','a',{action:'save',item:{name:'Skis only',releaseId:'release',parts:[{partId:'figure',quantity:0},{partId:'skis',quantity:2}]}},collection);
 await post('/api/collection','b',{action:'save',item:{name:'Public copy',releaseId:'release',ownership:'owned'}},collection);
 await post('/api/collection','b',{action:'save',item:{name:'Uncertain',releaseId:'release'}},collection);
 const stats=await (await counts.GET(request('/api/catalog/counts?id=release','b'))).json();assert.equal(stats.counts.find(c=>c.ownership==='owned'&&c.visibility==='private').total,2);assert.equal(stats.counts.find(c=>c.ownership==='owned'&&c.visibility==='public').total,1);assert.equal(stats.distinctCollectors.find(c=>c.ownership==='owned').collectors,2);assert(!JSON.stringify(stats).includes(a.id));
 const directory=await (await collectors.GET(request('/api/collectors','a'))).json();assert.equal(directory.collections.length,1);assert.equal(directory.collections[0].display_name,'Collector Bravo');assert(!JSON.stringify(directory).includes('PRIVATE'));
 assert.equal((await collection.GET(request('/api/collection?collectionId='+a.collectionId,'b'))).status,404);
 assert.equal((await transfer.GET(request('/api/transfer?kind=catalog','a'))).status,403);assert.equal((await transfer.GET(request('/api/transfer'))).status,401);
 const csvTemplate=await (await transfer.GET(request('/api/transfer?template=true&format=csv','a'))).text();const templatePreview=await post('/api/transfer','a',{action:'preview',kind:'collection',format:'csv',text:csvTemplate},transfer);assert.equal(templatePreview.errors.length,0);
 const unsafeName='=SUM(1,2)\n"quoted"';const csv=format.csvEncode([{name:unsafeName,condition:'Good',parts:[],unidentifiedParts:[]}],'collection');assert(csv.includes("'=SUM"));assert.equal(format.parseTransfer(csv,'csv','collection')[0].name,unsafeName);
 const file={version:1,kind:'collection',items:[{name:unsafeName,releaseId:'release',parts:[{partId:'figure',quantity:0},{partId:'skis',quantity:null}],unidentifiedParts:[{name:'Unknown helmet',quantity:0}]}]};
 const preview=await post('/api/transfer','a',{action:'preview',kind:'collection',format:'json',text:JSON.stringify(file)},transfer);assert.equal(preview.rows[0].action,'add');const before=sqlite.prepare('SELECT count(*) AS n FROM owned_entries').get().n;
 await post('/api/transfer','b',{action:'commit',previewId:preview.previewId},transfer,400);await post('/api/transfer','a',{action:'commit',previewId:preview.previewId},transfer);await post('/api/transfer','a',{action:'commit',previewId:preview.previewId},transfer);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM owned_entries').get().n,before+1);
 assert.equal(sqlite.prepare('SELECT quantity FROM owned_parts WHERE entry_id=? AND part_id=?').get(preview.rows[0].id,'figure').quantity,0);assert.equal(sqlite.prepare('SELECT quantity FROM owned_parts WHERE entry_id=? AND part_id=?').get(preview.rows[0].id,'skis').quantity,null);
 const bad=await post('/api/transfer','b',{action:'preview',kind:'collection',format:'json',text:JSON.stringify({version:1,kind:'collection',items:[{id:first.id,name:'Hijack'},{name:'Bad date',acquiredAt:'2026-02-30'}]})},transfer);assert.equal(bad.errors.length,2);assert.equal(bad.previewId,null);assert.equal(sqlite.prepare('SELECT name FROM owned_entries WHERE id=?').get(first.id).name,'First');
 const exported=await (await transfer.GET(request('/api/transfer?format=json','a'))).json();assert(exported.items.some(i=>i.notes==='PRIVATE ALPHA'));assert(!JSON.stringify(exported).includes('Public copy'));assert(Array.isArray(exported.mediaMapping));assert(exported.items.every(i=>!('photos' in i)));const ownRoundtrip=await post('/api/transfer','a',{action:'preview',kind:'collection',format:'csv',text:format.csvEncode(exported.items,'collection')},transfer);assert.equal(ownRoundtrip.errors.length,0);
 const duplicateCommit=await post('/api/transfer','a',{action:'preview',kind:'collection',format:'json',text:JSON.stringify({version:1,kind:'collection',items:[{id:first.id,name:'Must not overwrite a newer edit'}]})},transfer);beforeBatch=()=>{sqlite.prepare('UPDATE import_runs SET committed=1 WHERE id=?').run(duplicateCommit.previewId);sqlite.prepare('UPDATE owned_entries SET name=? WHERE id=?').run('Concurrent edit',first.id);};const replay=await post('/api/transfer','a',{action:'commit',previewId:duplicateCommit.previewId},transfer);assert.equal(replay.alreadyCommitted,true);assert.equal(sqlite.prepare('SELECT name FROM owned_entries WHERE id=?').get(first.id).name,'Concurrent edit');assert.equal(sqlite.prepare('SELECT private_notes FROM owned_entries WHERE id=?').get(first.id).private_notes,'PRIVATE ALPHA');
 const pair={version:1,kind:'catalog',items:[{id:'pair-a',name:'Variant A',kind:'figure',parts:[{id:'pair-part',name:'Primary',kind:'primary',expectedQuantity:1,linkedReleaseId:'pair-b'}],related:[{id:'pair-b',kind:'variant'}]},{id:'pair-b',name:'Variant B',kind:'figure'}]};const catalogPreview=await post('/api/transfer','admin-subject',{action:'preview',kind:'catalog',format:'json',text:JSON.stringify(pair)},transfer);assert.equal(catalogPreview.errors.length,0);await post('/api/transfer','admin-subject',{action:'commit',previewId:catalogPreview.previewId},transfer);const related=await (await catalog.GET(request('/api/catalog?id=pair-b'))).json();assert(related.related.some(r=>r.id==='pair-a'));
 const catalogCsv=await (await transfer.GET(request('/api/transfer?kind=catalog&format=csv','admin-subject'))).text();assert.equal(format.parseTransfer(catalogCsv,'csv','catalog')[0].kind,'figure');
 const stale=await post('/api/transfer','admin-subject',{action:'preview',kind:'catalog',format:'json',text:JSON.stringify({version:1,kind:'catalog',items:[{name:'Must not be added',kind:'other'},{...release,expectedRevision:1}]})},transfer);await post('/api/catalog','admin-subject',{release:{...release,expectedRevision:1}},catalog);await post('/api/transfer','admin-subject',{action:'commit',previewId:stale.previewId},transfer,409);assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM catalog_releases WHERE name='Must not be added'").get().n,0);
 const jpeg=require('jpeg-js');const dirty=jpeg.encode({width:2,height:2,data:Buffer.alloc(16,255),comments:['SECRET GPS COMMENT']},85).data;const clean=imageTools.cleanImage(dirty);assert(!Buffer.from(clean).includes(Buffer.from('SECRET GPS COMMENT')));assert.equal(jpeg.decode(clean).width,2);assert.throws(()=>imageTools.cleanImage(new Uint8Array([255,216,255])));
 const history=moduleAt('app/api/catalog/history/route.ts');assert.equal((await history.GET(request('/api/catalog/history?id=release','b'))).status,403);assert.equal((await (await history.GET(request('/api/catalog/history?id=release','admin-subject'))).json()).revisions.length,2);
 const catalogImage=await (await upload('admin-subject','catalog')).json();await post('/api/media/links','admin-subject',{mediaId:catalogImage.id,releaseId:'release'},links);await post('/api/media/links','admin-subject',{mediaId:catalogImage.id,fileCardId:'card'},links);await post('/api/media/links','b',{action:'cover',mediaId:catalogImage.id,releaseId:'release'},links,403);await post('/api/media/links','admin-subject',{action:'cover',mediaId:catalogImage.id,releaseId:'release'},links);const cardLink=sqlite.prepare('SELECT id FROM media_links WHERE media_id=? AND file_card_id=?').get(catalogImage.id,'card');await post('/api/media/links','admin-subject',{action:'unlink',mediaId:catalogImage.id,linkId:cardLink.id},links);assert.equal((await photo.GET(request(catalogImage.url))).status,200);
 const uploaded=await (await upload('a')).json();await post('/api/media/links','a',{mediaId:uploaded.id,entryId:first.id},links);const objectKey=sqlite.prepare('SELECT object_key FROM media WHERE id=?').get(uploaded.id).object_key;
 await post('/api/catalog','admin-subject',{release:{id:'survivor',name:'Survivor',kind:'figure',parts:[{id:'new-figure',name:'Figure',kind:'primary',expectedQuantity:1}]}},catalog);
 await post('/api/catalog/merge','a',{action:'preview',sourceId:'release',targetId:'survivor'},merge,403);const mergePreview=await post('/api/catalog/merge','admin-subject',{action:'preview',sourceId:'release',targetId:'survivor'},merge);assert.equal(mergePreview.impactedCopies,6);assert(!JSON.stringify(mergePreview).includes('PRIVATE ALPHA'));
 await post('/api/catalog/merge','admin-subject',{sourceId:'release',targetId:'survivor',sourceRevision:2,targetRevision:1,mapping:{figure:'new-figure'}},merge,400);
 const staleEntry=await moduleAt('lib/collection/store.ts').prepareEntry(a,{...editor.draftFromEntry(first),reviewedRevision:2});
 beforeBatch=()=>sqlite.prepare('UPDATE catalog_releases SET revision=3 WHERE id=?').run('release');await post('/api/catalog/merge','admin-subject',{sourceId:'release',targetId:'survivor',sourceRevision:2,targetRevision:1,mapping:{figure:'new-figure',skis:'preserve'}},merge,409);assert.equal(sqlite.prepare('SELECT release_id FROM owned_entries WHERE id=?').get(first.id).release_id,'release');sqlite.prepare('UPDATE catalog_releases SET revision=2 WHERE id=?').run('release');
 beforeBatch=()=>sqlite.prepare('UPDATE owned_parts SET quantity=7 WHERE entry_id=? AND part_id=?').run(first.id,'skis');await post('/api/catalog/merge','admin-subject',{sourceId:'release',targetId:'survivor',sourceRevision:2,targetRevision:1,mapping:{figure:'new-figure',skis:'preserve'}},merge);
 await assert.rejects(()=>database.batch(staleEntry.statements),/merged release requires reload/);
 const moved=await (await collection.GET(request('/api/collection','a'))).json();assert.equal(moved.items.find(i=>i.id===first.id).notes,'PRIVATE ALPHA');assert.equal(moved.items.find(i=>i.id===first.id).releaseId,'survivor');assert.equal(moved.items.find(i=>i.id===first.id).parts.find(p=>p.label==='Skis').quantity,7);assert.equal(moved.items.find(i=>i.id===first.id).needsReview,true);assert(moved.items.find(i=>i.id===first.id).photos.includes(uploaded.url));assert.equal((await (await catalog.GET(request('/api/catalog?id=release'))).json()).release.id,'survivor');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM merge_holdings').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM operation_guards').get().n,0);
 await post('/api/account','a',{action:'delete',confirmation:'no'},account,400);const lateKey='collections/'+a.collectionId+'/late-photo';beforeBatch=()=>{objects.set(lateKey,objects.get(objectKey));sqlite.prepare("INSERT INTO media(id,object_key,owner_id,collection_id,scope,content_type,bytes,created_at) VALUES(?,?,?,?,'collection','image/jpeg',1,'now')").run(crypto.randomUUID(),lateKey,a.id,a.collectionId);};failR2Delete=true;const deletion=await post('/api/account','a',{action:'delete',confirmation:'DELETE MY ACCOUNT'},account);assert.equal(deletion.cleanup,'pending');assert(JSON.parse(sqlite.prepare('SELECT remaining_keys FROM deletion_jobs WHERE user_id=?').get(a.id).remaining_keys).includes(lateKey));assert.equal((await account.GET(request('/api/account','a'))).status,403);assert.equal((await photo.GET(request(uploaded.url,'a'))).status,403);assert.equal((await photo.GET(request(uploaded.url,'b'))).status,404);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM owned_entries WHERE collection_id=?').get(a.collectionId).n,0);assert.equal(sqlite.prepare('SELECT email FROM users WHERE id=?').get(a.id).email,null);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM identities WHERE user_id=?').get(a.id).n,0);assert(objects.has(objectKey));
 assert.equal((await deletionStatus.GET(request('/api/account/deletion','a'))).status,200);await post('/api/account','b',{action:'resumeDeletion'},account,404);await post('/api/maintenance','b',{},maintenance,403);failR2Delete=false;await post('/api/maintenance','admin-subject',{},maintenance);assert(!objects.has(objectKey));assert.equal((await (await deletionStatus.GET(request('/api/account/deletion','a'))).json()).cleanup,'complete');assert.equal((await account.GET(request('/api/account','a'))).status,403);
 // Restore rehearsal: a pre-deletion D1 snapshot cannot erase the independent R2 ledger.
 sqlite.prepare('UPDATE users SET deleted_at=NULL,email=? WHERE id=?').run('restored-private-email@example.com',a.id);sqlite.prepare('INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)').run('chatgpt','a',a.id);sqlite.prepare('INSERT INTO collections(id,user_id,created_at,updated_at) VALUES(?,?,?,?)').run(a.collectionId,a.id,'old','old');await post('/api/maintenance','admin-subject',{action:'reapplyDeletions'},maintenance);assert.equal((await account.GET(request('/api/account','a'))).status,403);assert.equal(sqlite.prepare('SELECT email FROM users WHERE id=?').get(a.id).email,null);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM collections WHERE user_id=?').get(a.id).n,0);
 for(let i=0;i<3;i++)await limits.limit(b.id,'test',3);await assert.rejects(()=>limits.limit(b.id,'test',3),e=>e.status===429);sqlite.prepare('UPDATE rate_limits SET window=0 WHERE key=?').run(b.id+':test');await limits.limit(b.id,'test',3);assert.equal(sqlite.prepare('SELECT attempts FROM rate_limits WHERE key=?').get(b.id+':test').attempts,1);
 const survivor=await (await catalog.GET(request('/api/catalog?id=survivor'))).json();assert.equal(survivor.fileCards.length,1);const changed=moduleAt('lib/catalog-editor.ts').releaseDraft(survivor);changed.fileCards=[];await post('/api/catalog','admin-subject',{release:changed},catalog);assert.equal((await (await catalog.GET(request('/api/catalog?id=survivor'))).json()).fileCards.length,0);
 await post('/api/account','b',null,account,400);
 assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM items').get().n,1);
 console.log('Step 4 passed: profiles, private-safe counts/public browsing, taxonomy cycles/filtering, CSV/JSON round trips, staged imports/replay/isolation/stale validation, JPEG decoding/metadata stripping, explicit merge preservation, resumable deletion/access revocation and durable rate limits.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
