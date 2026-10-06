// Exercise route handlers against real SQLite, not SQL-shaped in-memory mocks.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
sqlite.prepare('INSERT INTO items(id,data) VALUES(?,?)').run('legacy', '{"name":"untouched"}');
let failMediaWrite = false;
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
  async batch(statements) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const objects = new Map();
const bucket = {
  async put(key, bytes, options) { objects.set(key, { body: bytes, httpMetadata: options.httpMetadata }); },
  async get(key) { return objects.get(key) ?? null; },
  async delete(key) { objects.delete(key); },
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
(async () => {
  assert.equal((await collection.GET(request('/api/collection'))).status, 401);
  const empty=await (await catalog.GET(request('/api/catalog'))).json();assert.equal(empty.total,0);assert.equal(empty.releases.length,0);assert.equal(empty.lines.length,0);
  assert.equal((await catalog.GET(request('/api/catalog?ownership=unowned'))).status,401);
  assert.equal(editor.nullableQuantity(''),null);assert.equal(editor.nullableQuantity('0'),0);
  const b = await auth.actor(request('/api/account', 'collector-b'));
  assert.equal(b.isAdmin, false); // First registration and matching email do not confer admin.
  const [a, again] = await Promise.all([auth.actor(request('/api/account', 'collector-a')), auth.actor(request('/api/account', 'collector-a'))]);
  assert.equal(a.id, again.id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM collections WHERE user_id=?').get(a.id).n, 1);
  assert.equal(sqlite.prepare('SELECT visibility FROM collections WHERE user_id=?').get(a.id).visibility, 'private');
  const admin = await auth.actor(request('/api/account', 'admin-subject'));
  assert.equal(admin.isAdmin, true);
  assert.equal((await audit.GET(request('/api/catalog-review','collector-a'))).status,403);
  assert.equal((await audit.GET(request('/api/catalog-review','admin-subject'))).status,410);
  await post('/api/collection','collector-a',{action:'save',item:{name:'Attempt',collectionId:b.collectionId}},collection,400);
  const release = { id: 'snow-job', name: 'Snow Job', kind: 'figure', line: 'A Real American Hero', year: 1983, parts: [
    { id: 'sj-figure', name: 'Figure', kind: 'primary', expectedQuantity: 1 },
    { id: 'sj-skis', name: 'Skis', kind: 'accessory', parentId: 'sj-figure', expectedQuantity: 2 },
  ] };
  await post('/api/catalog', 'collector-a', { release }, catalog, 403);
  await post('/api/catalog', 'admin-subject', { release }, catalog);
  assert.equal((await catalog.GET(request('/api/catalog?id=snow-job'))).status, 200);
  await post('/api/catalog', 'admin-subject', { release: { ...release, id: 'cycle', parts: [{id:'c1',name:'One',kind:'primary',expectedQuantity:1,parentId:'c2'},{id:'c2',name:'Two',kind:'accessory',expectedQuantity:1,parentId:'c1'}] } }, catalog, 400);
  await post('/api/catalog', 'admin-subject', { release: { ...release, id: 'different' } }, catalog, 400);
  const pack = {id:'multipack',name:'Two figures',kind:'multipack',parts:[{id:'pack-a',name:'Figure A',kind:'primary',expectedQuantity:1},{id:'pack-b',name:'Figure B',kind:'primary',expectedQuantity:1},{id:'pack-gear',name:'Two helmets',kind:'accessory',parentId:'pack-b',expectedQuantity:2}]};
  await post('/api/catalog','admin-subject',{release:pack},catalog);
  const packEntry=(await post('/api/collection','collector-a',{action:'save',item:{name:'Incomplete multipack',releaseId:'multipack',completeness:'Partial',parts:[{partId:'pack-a',quantity:1},{partId:'pack-b',quantity:0},{partId:'pack-gear',quantity:2}]}},collection)).item;
  assert.equal(packEntry.ownership,'owned');assert.equal(packEntry.parts.find(p=>p.partId==='pack-gear').quantity,2);
  await post('/api/collection','collector-a',{action:'save',item:{name:'Invalid association',releaseId:'snow-job',parts:[{partId:'pack-gear',quantity:1}]}},collection,400);
  const skis = { name: 'My skis', releaseId: 'snow-job', notes: 'PRIVATE NOTE', location: 'PRIVATE LOCATION', acquiredAt: '2026-10-05', purchasePriceCents: 2500, purchaseCurrency: 'USD', purchaseSource: 'PRIVATE SOURCE', parts: [{partId:'sj-figure',quantity:0},{partId:'sj-skis',quantity:2}] };
  const saved = (await post('/api/collection','collector-a',{action:'save',item:skis},collection)).item;
  assert.equal(saved.ownership, 'parts_only');
  const unowned=await (await catalog.GET(request('/api/catalog?ownership=unowned','collector-a'))).json();assert(unowned.releases.some(r=>r.id==='snow-job'&&r.ownership_status==='parts_only'));assert(!unowned.releases.some(r=>r.id==='multipack'));
  const filtered=await (await catalog.GET(request('/api/catalog?q=Snow&line=A%20Real%20American%20Hero&year=1983&limit=1'))).json();assert.equal(filtered.total,1);assert.equal(filtered.releases[0].id,'snow-job');
  const page=await (await catalog.GET(request('/api/catalog?limit=1&offset=1'))).json();assert.equal(page.releases.length,1);assert.equal(page.total,2);
  const detail=await (await catalog.GET(request('/api/catalog?id=snow-job'))).json();const draft=editor.newDraft(detail);assert(draft.parts.every(p=>p.quantity===null));const chosen=editor.quickChoice(draft,'Complete',detail.parts);assert.equal(chosen.packaging,'present');assert.equal(chosen.parts.find(p=>p.partId==='sj-skis').quantity,2);assert.equal(chosen.sealed,null);
  const fromRead=editor.draftFromEntry(saved);assert(!('needsReview' in fromRead));assert(!('label' in fromRead.parts[0]));await post('/api/collection','collector-a',{action:'save',item:fromRead},collection);
  const second = (await post('/api/collection','collector-a',{action:'save',item:{name:'Second copy',releaseId:'snow-job',condition:'Fair',parts:[{partId:'sj-figure',quantity:1},{partId:'sj-skis',quantity:null}]}},collection)).item;
  assert.notEqual(saved.id, second.id);const ownedQuery=await (await catalog.GET(request('/api/catalog?ownership=unowned','collector-a'))).json();assert(!ownedQuery.releases.some(r=>r.id==='snow-job')); assert.equal(second.parts.find(p=>p.partId==='sj-skis').quantity, null);
  await post('/api/collection','collector-b',{action:'save',item:{...skis,id:saved.id}},collection,404);
  await post('/api/collection','collector-b',{action:'delete',item:{id:saved.id}},collection,404);
  assert.equal((await collection.GET(request('/api/collection?collectionId='+a.collectionId,'collector-b'))).status,404);
  assert.equal((await collection.GET(request('/api/collection?collectionId='+a.collectionId,'admin-subject'))).status,404);
  assert.equal((await collection.POST(request('/api/collection','collector-a',{action:'delete',item:{id:saved.id}},'https://evil.example'))).status,403);
  await post('/api/collection','collector-a',{action:'save',item:{...skis,quantity:2}},collection,400);
  await post('/api/collection','collector-a',{action:'save',item:{...skis,parts:[{partId:'sj-skis',quantity:-1}]}},collection,400);
  await post('/api/collection','collector-a',{action:'save',item:{...skis,completeness:'Complete',packaging:'absent'}},collection,400);
  const complete=(await post('/api/collection','collector-a',{action:'save',item:{name:'Boxed copy',releaseId:'snow-job',completeness:'Complete'}},collection)).item;
  assert.equal(complete.packaging,'present'); assert.equal(complete.sealed,null); assert.equal(complete.condition,'Unknown'); assert.equal(complete.parts.find(p=>p.partId==='sj-skis').quantity,2);
  const uploaded=await upload('collector-a'); assert.equal(uploaded.status,200); const image=await uploaded.json();
  assert.equal((await photo.GET(request(image.url,'collector-a'))).status,200);
  assert.equal((await photo.GET(request(image.url,'collector-b'))).status,404);
  assert.equal((await photo.GET(request(image.url))).status,404);
  assert.equal((await upload('collector-a','catalog')).status,403);
  assert.equal((await upload('collector-a','collection',false)).status,400);
  await post('/api/media/links','collector-b',{mediaId:image.id,entryId:saved.id},links,404);
  await post('/api/media/links','collector-a',{mediaId:image.id,releaseId:'snow-job'},links,403);
  await post('/api/media/links','collector-a',{mediaId:image.id,entryId:saved.id},links);
  await post('/api/collection','collector-a',{action:'visibility',visibility:'public'},collection);
  let publicResponse=await collection.GET(request('/api/collection?collectionId='+a.collectionId,'collector-b'));
  assert.equal(publicResponse.status,200); const publicBody=await publicResponse.text();
  for(const secret of ['PRIVATE NOTE','PRIVATE LOCATION','PRIVATE SOURCE','purchasePriceCents','acquiredAt','same-private-email'])assert(!publicBody.includes(secret),secret);
  assert.equal((await photo.GET(request(image.url,'collector-b'))).status,200);
  assert.equal((await photo.GET(request(image.url))).status,404);
  const unlinked=await (await upload('collector-a')).json();
  assert.equal((await photo.GET(request(unlinked.url,'collector-b'))).status,404);
  await post('/api/collection','collector-a',{action:'visibility',visibility:'private'},collection);
  assert.equal((await photo.GET(request(image.url,'collector-b'))).status,404);
  assert.equal((await photo.GET(request(image.url,'collector-a'))).headers.get('cache-control'),'private, no-store');
  const reference=moduleAt('app/api/reference-photo/route.ts');const partImages=moduleAt('app/api/accessory-images/route.ts');const market=moduleAt('app/api/market/route.ts');assert.equal((await market.GET(request('/api/market?id=snow-job'))).status,501);assert.equal((await reference.GET(request('/api/reference-photo?id=snow-job'))).status,404);
  const catalogPhoto=await (await upload('admin-subject','catalog')).json();
  assert.equal((await photo.GET(request(catalogPhoto.url))).status,404);
  await post('/api/media/links','admin-subject',{mediaId:catalogPhoto.id,releaseId:'snow-job'},links);
  assert.equal((await photo.GET(request(catalogPhoto.url))).status,200);
  const refResponse=await reference.GET(request('/api/reference-photo?id=snow-job'));assert.equal(refResponse.status,302);assert.equal(refResponse.headers.get('location'),catalogPhoto.url);
  const imageList=await (await catalog.GET(request('/api/catalog?q=Snow'))).json();assert.equal(imageList.releases[0].image_id,catalogPhoto.id);
  const partPhoto=await (await upload('admin-subject','catalog')).json();await post('/api/media/links','admin-subject',{mediaId:partPhoto.id,partId:'sj-skis'},links);const gallery=await (await partImages.GET(request('/api/accessory-images?id=snow-job'))).json();assert.equal(gallery.images[0].url,partPhoto.url);
  const before=objects.size;failMediaWrite=true;assert.equal((await upload('collector-a')).status,503);failMediaWrite=false;assert.equal(objects.size,before);
  await post('/api/catalog','admin-subject',{release:{...release,expectedRevision:1,parts:[release.parts[0]]}},catalog);
  await post('/api/catalog','admin-subject',{release:{...release,expectedRevision:1}},catalog,409);
  const retiredSaved=(await post('/api/collection','collector-a',{action:'save',item:{name:'My skis',id:saved.id,releaseId:'snow-job',parts:[{partId:'sj-figure',quantity:0}]}},collection)).item;
  assert.equal(retiredSaved.parts.find(p=>p.partId==='sj-skis').quantity,2);assert.equal(retiredSaved.needsReview,true);
  sqlite.prepare('UPDATE users SET deleted_at=? WHERE id=?').run('2026-10-05',a.id);
  assert.equal((await account.GET(request('/api/account','collector-a'))).status,403);
  assert.equal((await photo.GET(request(image.url,'collector-b'))).status,404);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM items').get().n,1); // Additive migration did not reset legacy data.
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.throws(()=>sqlite.prepare('INSERT INTO collections(id,user_id,created_at,updated_at) VALUES(?,?,?,?)').run('duplicate',b.id,'now','now'));
  assert.throws(()=>sqlite.prepare('UPDATE owned_parts SET quantity=-1 WHERE entry_id=?').run(second.id));
  const plan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM owned_entries WHERE collection_id=? AND release_id=?').all(b.collectionId,'snow-job');
  assert(plan.some(p=>p.detail.includes('entries_collection_release_idx')));
  console.log('Step 2 passed: additive migrations, stable identities, private defaults, administrator grants, catalog cycles/revisions, separate copies, nullable quantities, cross-user isolation, public field projection, media ownership/visibility, upload compensation, deletion denial, SQL constraints and indexes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sqlite.close());
