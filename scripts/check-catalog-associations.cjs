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
 const taxonomy=moduleAt('app/api/taxonomy/route.ts'),transfer=moduleAt('app/api/transfer/route.ts'),merge=moduleAt('app/api/catalog/merge/route.ts'),format=moduleAt('lib/transfer-format.ts'),draft=moduleAt('lib/catalog-editor.ts');
 const a=await auth.actor(request('/api/account','a'));await auth.actor(request('/api/account','admin-subject'));
 async function get(route,handler=catalog,subject){const r=await handler.GET(request(route,subject));assert.equal(r.status,200,await r.clone().text());return r.json();}
 async function save(release){return post('/api/catalog','admin-subject',{release},catalog);}
 const cobra=await post('/api/taxonomy','admin-subject',{name:'Cobra',kind:'faction'},taxonomy);
 const dread=await post('/api/taxonomy','admin-subject',{name:'Dreadnoks',kind:'faction',parentId:cobra.id},taxonomy);
 const sub=await post('/api/taxonomy','admin-subject',{name:'Subgroup',kind:'faction',parentId:dread.id},taxonomy);
 const joe=await post('/api/taxonomy','admin-subject',{name:'G.I. Joe',kind:'faction'},taxonomy);
 const line=await post('/api/taxonomy','admin-subject',{name:'ARAH',kind:'line'},taxonomy);
 const raceA=await post('/api/taxonomy','admin-subject',{name:'Race A',kind:'faction'},taxonomy),raceB=await post('/api/taxonomy','admin-subject',{name:'Race B',kind:'faction'},taxonomy);
 const prepare=database.prepare;database.prepare=function(sql){if(sql.startsWith('INSERT INTO taxonomy(')){sqlite.prepare('UPDATE taxonomy SET parent_id=? WHERE id=?').run(raceA.id,raceB.id);database.prepare=prepare;}return prepare.call(this,sql);};
 await post('/api/taxonomy','admin-subject',{id:raceA.id,name:'Race A',kind:'faction',parentId:raceB.id},taxonomy,409);assert.equal(sqlite.prepare('SELECT parent_id FROM taxonomy WHERE id=?').get(raceA.id).parent_id,null);
 await post('/api/taxonomy','admin-subject',{id:cobra.id,name:'Cobra',kind:'faction',parentId:sub.id},taxonomy,400);
 await post('/api/taxonomy','admin-subject',{id:dread.id,name:'Dreadnoks',kind:'faction',parentId:line.id},taxonomy,400);
 await post('/api/taxonomy','admin-subject',{name:'cobra',kind:'faction'},taxonomy,400);
 const release={id:'pack',name:'Mixed pack',kind:'multipack',characters:[{name:'Snake Eyes',partId:'figure1'},{name:'Zartan',partId:'figure2'}],factions:['G.I. Joe','Subgroup'],parts:[{id:'figure1',name:'Snake Eyes figure',kind:'primary',expectedQuantity:1},{id:'figure2',name:'Zartan figure',kind:'primary',expectedQuantity:1}]};
 await save(release);let detail=await get('/api/catalog?id=pack');assert.equal(detail.characters.length,2);assert.equal(detail.characters[1].partId,'figure2');assert.equal(detail.factions.length,2);
 assert.equal((await get('/api/catalog?q=Zartan')).total,1);assert.equal((await get('/api/catalog?character=Snake%20Eyes')).total,1);
 for(const faction of [cobra.id,dread.id,sub.id,'Cobra','Dreadnoks'])assert.equal((await get('/api/catalog?faction='+encodeURIComponent(faction))).total,1);
 assert.equal((await get('/api/catalog?taxonomyId='+cobra.id)).total,1);assert.equal((await get('/api/catalog?faction=Unknown')).total,0);
 await post('/api/collection','a',{action:'save',item:{releaseId:'pack',name:'My mixed pack',ownership:'owned'}},collection);
 const owned=await get('/api/collection',collection,'a');assert(owned.items[0].factionIds.includes(cobra.id));assert(owned.items[0].taxonomyIds.includes(dread.id));assert(owned.items[0].factionNames.includes('Cobra'));
 await post('/api/catalog','a',{release:{name:'Not admin',kind:'figure',characters:[],factions:[]}},catalog,403);
 await post('/api/catalog','admin-subject',{release:{...release,id:'bad',parts:[],characters:[{name:'Other',partId:'figure1'}]}},catalog,400);
 await post('/api/catalog','admin-subject',{release:{name:'Duplicate',kind:'figure',characters:[{name:'Snake Eyes'},{name:'snake eyes'}]}},catalog,400);
 const distinct={id:'repeats',name:'Repeated figures',kind:'multipack',characters:[{name:'Snake Eyes',partId:'p1'},{name:'Snake Eyes',partId:'p2'}],parts:[{id:'p1',name:'One',kind:'primary',expectedQuantity:1},{id:'p2',name:'Two',kind:'primary',expectedQuantity:1}],factions:[]};await save(distinct);assert.equal((await get('/api/catalog?id=repeats')).characters.length,2);
 // An unconverted record remains visible without guessing comma-separated names.
 await save({id:'legacy-release',name:'Legacy vehicle',kind:'vehicle'});sqlite.prepare("UPDATE catalog_releases SET character='Name, with comma',faction='Dreadnoks' WHERE id='legacy-release'").run();
 let legacy=await get('/api/catalog?id=legacy-release');assert.equal(legacy.characters[0].name,'Name, with comma');assert.equal(legacy.factions[0].name,'Dreadnoks');assert.equal((await get('/api/catalog?faction='+cobra.id)).total,2);
 const normalized=draft.releaseDraft(legacy);await save(normalized);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM release_characters WHERE release_id='legacy-release'").get().n,1);
 // CSV/JSON exports preserve arrays, optional part links, and explicit empty lists.
 detail=await get('/api/catalog?id=pack');const row=draft.releaseDraft(detail);const csv=format.csvEncode([row],'catalog');const parsed=format.parseTransfer(csv,'csv','catalog')[0];assert.deepEqual(JSON.parse(JSON.stringify(parsed.characters)),release.characters);assert.equal(parsed.factions.length,2);
 const preview=await post('/api/transfer','admin-subject',{action:'preview',kind:'catalog',format:'csv',text:csv},transfer);assert.equal(preview.errors.length,0);await post('/api/transfer','admin-subject',{action:'commit',previewId:preview.previewId},transfer);
 const both=[{id:'one',name:'One',kind:'figure',characters:[],factions:['New Faction']},{id:'two',name:'Two',kind:'vehicle',characters:[],factions:['New Faction']}];
 const imported=await post('/api/transfer','admin-subject',{action:'preview',kind:'catalog',format:'json',text:JSON.stringify({version:1,kind:'catalog',items:both})},transfer);assert.equal(imported.errors.length,0);await post('/api/transfer','admin-subject',{action:'commit',previewId:imported.previewId},transfer);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM taxonomy WHERE kind='faction' AND name='New Faction'").get().n,1);
 const exportData=await get('/api/transfer?kind=catalog&format=json',transfer,'admin-subject');assert(exportData.items.find(i=>i.id==='pack').characters.length===2);
 const removed=draft.releaseDraft(await get('/api/catalog?id=repeats'));removed.characters=[];removed.factions=[];await save(removed);assert.equal((await get('/api/catalog?id=repeats')).characters.length,0);
 await save({id:'survivor',name:'Survivor',kind:'multipack',characters:[{name:'Duke'}],factions:['G.I. Joe'],parts:[]});
 const plan=await post('/api/catalog/merge','admin-subject',{action:'preview',sourceId:'pack',targetId:'survivor'},merge);await post('/api/catalog/merge','admin-subject',{sourceId:'pack',targetId:'survivor',sourceRevision:plan.source.revision,targetRevision:plan.target.revision,mapping:{figure1:'preserve',figure2:'preserve'}},merge);
 const merged=await get('/api/catalog?id=pack');assert.equal(merged.release.id,'survivor');assert.equal(merged.characters.length,3);assert(merged.characters.find(c=>c.name==='Zartan').partId!=='figure2');assert.equal(merged.factions.length,2);await save(draft.releaseDraft(merged));assert.equal((await get('/api/catalog?id=survivor')).characters.length,3);
 assert.equal((await get('/api/catalog?faction='+cobra.id)).total,2);assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);

 // Physical type is independent of the existing main-component ownership role.
 await save({id:'driver-reference',name:'Standalone driver',kind:'figure',parts:[{id:'reference-body',name:'Driver',partType:'figure',mainComponent:true,expectedQuantity:1},{id:'reference-gear',name:'Exclusive gear',partType:'accessory',expectedQuantity:1}]});
 const typed={id:'typed-vehicle',name:'Vehicle with driver',kind:'vehicle',characters:[{name:'Ace',partId:'typed-driver'}],parts:[{id:'typed-body',name:'Vehicle body',partType:'vehicle',mainComponent:true,expectedQuantity:1},{id:'typed-driver',name:'Driver',partType:'figure',mainComponent:false,expectedQuantity:1,linkedReleaseId:'driver-reference'},{id:'typed-wheels',name:'Wheels',partType:'other',mainComponent:false,parentId:'typed-body',expectedQuantity:4},{id:'typed-box',name:'Box',partType:'packaging',expectedQuantity:1},{id:'typed-card',name:'File card',partType:'paperwork',expectedQuantity:1}]};
 await save(typed);let typedDetail=await get('/api/catalog?id=typed-vehicle');assert.equal(typedDetail.parts.length,5);const driver=typedDetail.parts.find(p=>p.id==='typed-driver');assert.equal(driver.part_type,'figure');assert.equal(driver.main_component,0);assert.equal(driver.kind,'accessory');assert.equal(driver.linked_release_name,'Standalone driver');assert.equal(typedDetail.characters[0].partId,driver.id);
 const listedTyped=(await get('/api/catalog?q=Vehicle%20with%20driver')).releases.find(r=>r.id===typed.id);assert.equal(listedTyped.tileAttributes.contents.find(c=>c.type==='figure').quantity,1);assert.equal(listedTyped.tileAttributes.contents.find(c=>c.type==='vehicle').quantity,1);assert.equal(listedTyped.tileAttributes.hasParts,true);assert.equal(listedTyped.tileAttributes.hasFileCard,false);
 const listedPack=(await get('/api/catalog?q=Repeated%20figures')).releases[0];assert(Array.isArray(listedPack.tileAttributes.factions));assert.equal((await get('/api/catalog?q=no-such-item-at-all')).releases.length,0);
 const driverOnly=await post('/api/collection','a',{action:'save',item:{name:'Driver only',releaseId:typed.id,parts:[{partId:'typed-body',quantity:0},{partId:'typed-driver',quantity:1}]}},collection);assert.equal(driverOnly.item.ownership,'parts_only');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM owned_entries WHERE release_id=?').get('driver-reference').n,0);
 const bodyOnly=await post('/api/collection','a',{action:'save',item:{name:'Body only',releaseId:typed.id,parts:[{partId:'typed-body',quantity:1},{partId:'typed-driver',quantity:0}]}},collection);assert.equal(bodyOnly.item.ownership,'owned');
 await post('/api/collection','a',{action:'save',item:{name:'Incomplete box',releaseId:typed.id,completeness:'Complete',packaging:'present',parts:[{partId:'typed-body',quantity:1}]}},collection,400);
 await post('/api/catalog','admin-subject',{release:{name:'Bad packaging',kind:'figure',parts:[{id:'bad-box',name:'Box',partType:'packaging',mainComponent:true,expectedQuantity:1}]}},catalog,400);
 await post('/api/catalog','admin-subject',{release:{name:'Bad type',kind:'figure',parts:[{id:'bad-type',name:'Bad',partType:'primary',expectedQuantity:1}]}},catalog,400);
 await post('/api/catalog','admin-subject',{release:{id:'self-reference',name:'Self reference',kind:'figure',parts:[{id:'self-part',name:'Self',partType:'figure',linkedReleaseId:'self-reference',expectedQuantity:1}]}},catalog,400);
 await post('/api/catalog','admin-subject',{release:{name:'Cycle',kind:'figure',parts:[{id:'cycle-one',parentId:'cycle-two',name:'One',partType:'other',expectedQuantity:1},{id:'cycle-two',parentId:'cycle-one',name:'Two',partType:'other',expectedQuantity:1}]}},catalog,400);
 const typedDraft=draft.releaseDraft(typedDetail),typedCSV=format.csvEncode([typedDraft],'catalog');const typedParsed=format.parseTransfer(typedCSV,'csv','catalog')[0];assert.equal(typedParsed.parts.find(p=>p.id==='typed-driver').partType,'figure');assert.equal(typedParsed.parts.find(p=>p.id==='typed-driver').mainComponent,false);
 const typedPreview=await post('/api/transfer','admin-subject',{action:'preview',kind:'catalog',format:'csv',text:typedCSV},transfer);assert.equal(typedPreview.errors.length,0);await post('/api/transfer','admin-subject',{action:'commit',previewId:typedPreview.previewId},transfer);
 // Migration adds nullable columns, leaving old rows and ownership intact.
 sqlite.prepare('UPDATE catalog_parts SET part_type=NULL,main_component=NULL WHERE id=?').run('reference-body');const legacyTyped=await get('/api/catalog?id=driver-reference');assert.equal(legacyTyped.parts[0].part_type,'figure');assert.equal(legacyTyped.parts[0].main_component,1);await save(draft.releaseDraft(legacyTyped));
 await save({id:'typed-target',name:'Merge target',kind:'vehicle',parts:[{id:'target-wrong-type',name:'Figure',partType:'figure',mainComponent:true,expectedQuantity:1}]});
 const typedPlan=await post('/api/catalog/merge','admin-subject',{action:'preview',sourceId:typed.id,targetId:'typed-target'},merge);const typedMapping=Object.fromEntries(typedPlan.parts.map(p=>[p.id,'preserve']));
 await post('/api/catalog/merge','admin-subject',{sourceId:typed.id,targetId:'typed-target',sourceRevision:typedPlan.source.revision,targetRevision:typedPlan.target.revision,mapping:{...typedMapping,'typed-body':'target-wrong-type'}},merge,400);
 await post('/api/catalog/merge','admin-subject',{sourceId:typed.id,targetId:'typed-target',sourceRevision:typedPlan.source.revision,targetRevision:typedPlan.target.revision,mapping:typedMapping},merge);
 const preservedDriver=sqlite.prepare('SELECT * FROM catalog_parts WHERE release_id=? AND name=?').get('typed-target','Driver');assert.equal(preservedDriver.part_type,'figure');assert.equal(preservedDriver.main_component,0);assert.equal(preservedDriver.linked_release_id,'driver-reference');assert.equal(sqlite.prepare('SELECT quantity FROM owned_parts WHERE entry_id=? AND part_id=?').get(driverOnly.item.id,preservedDriver.id).quantity,1);assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 console.log('PASS unified contents: physical types, main roles, driver-only ownership, no linked-copy creation, completeness, self-link/cycle/type rejection, typed CSV import, nullable legacy fallback and typed merge preservation.');
 console.log('PASS catalog associations: zero/multiple characters, optional scoped part links, parent/descendant faction filters, collection inheritance, hierarchy validation, legacy preservation, import/export, concurrent import term reuse, removal and merge preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
