// Exercise route handlers against real SQLite, not SQL-shaped in-memory mocks.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync('drizzle/' + file, 'utf8'));

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
 const discussions=moduleAt('app/api/discussions/route.ts'),posts=moduleAt('app/api/discussions/posts/route.ts'),follow=moduleAt('app/api/discussions/follow/route.ts'),reports=moduleAt('app/api/discussions/reports/route.ts'),moderation=moduleAt('app/api/discussions/moderation/route.ts'),notifications=moduleAt('app/api/notifications/route.ts');
 const deletion=moduleAt('lib/account-deletion.ts');
 const a=await auth.actor(request('/api/account','a')),b=await auth.actor(request('/api/account','b')),admin=await auth.actor(request('/api/account','admin-subject'));
 await post('/api/account','a',{action:'profile',displayName:'Alpha',visibility:'private'},account);
 await post('/api/account','b',{action:'profile',displayName:'Bravo',visibility:'private'},account);
 for(const h of [discussions,moderation,notifications])assert.equal((await h.GET(request('/api/discussions'))).status,401);
 for(const h of [discussions,posts,follow,reports,moderation,notifications])assert.equal((await h.POST(request('/api/discussions',null,{title:'Title',body:'Body'}))).status,401);
 assert.equal((await discussions.POST(request('/api/discussions','a',{title:'Title',body:'Body'},'https://evil.example'))).status,403);
 await post('/api/catalog','admin-subject',{release:{id:'release',name:'Snow Job',kind:'figure',parts:[]}},catalog);
 await post('/api/discussions','a',{title:'Bad release',body:'Body',releaseId:'missing'},discussions,400);
 const item=await post('/api/discussions','a',{title:'Skis question',body:'Original text <script>not executed</script>',releaseId:'release'},discussions,201);
 const site=await post('/api/discussions','b',{title:'Collecting tips',body:'Site thread'},discussions,201);
 const retryId=crypto.randomUUID();const once=await post('/api/discussions','b',{title:'Retry check',body:'Body',requestId:retryId},discussions,201);const twice=await post('/api/discussions','b',{title:'Retry check',body:'Body',requestId:retryId},discussions,201);assert.equal(once.id,twice.id);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_threads WHERE id=?').get(retryId).n,1);
 async function get(route,subject,handler){const r=await handler.GET(request(route,subject));assert.equal(r.status,200,await r.clone().text());return r.json();}
 const all=await get('/api/discussions','b',discussions),scoped=await get('/api/discussions?release=release','b',discussions);
 assert(all.threads.some(t=>t.id===item.id)&&all.threads.some(t=>t.id===site.id));assert.equal(scoped.threads.length,1);assert.equal(scoped.threads[0].id,item.id);
 assert(!JSON.stringify(all).includes('same-private-email'));assert(!JSON.stringify(all).includes('Original text'));
 let t=await get('/api/discussions?thread='+item.id,'a',discussions);assert.equal(t.following,true);assert.equal(t.posts[0].mine,1);const first=t.posts[0];
 await post('/api/discussions/posts','b',{action:'edit',postId:first.id,version:1,body:'Stolen'},posts,404);
 await post('/api/discussions/posts','a',{action:'edit',postId:first.id,version:1,body:'Updated text'},posts);
 await post('/api/discussions/posts','a',{action:'edit',postId:first.id,version:1,body:'Stale'},posts,409);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_revisions').get().n,1);
 assert.equal((await moderation.GET(request('/api/discussions/moderation?post='+first.id,'b'))).status,403);
 const history=await get('/api/discussions/moderation?post='+first.id,'admin-subject',moderation);assert.equal(history.revisions[0].body,'Original text <script>not executed</script>');
 await post('/api/discussions/follow','b',{threadId:item.id,follow:true},follow);
 const reply=await post('/api/discussions/posts','b',{action:'reply',threadId:item.id,body:'Two skis'},posts,201);
 const replyRetry=crypto.randomUUID();await post('/api/discussions/posts','b',{action:'reply',threadId:site.id,body:'Retry',requestId:replyRetry},posts,201);await post('/api/discussions/posts','b',{action:'reply',threadId:site.id,body:'Retry',requestId:replyRetry},posts,201);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_posts WHERE id=?').get(replyRetry).n,1);
 let notes=await get('/api/notifications','a',notifications);assert.equal(notes.unread,1);assert.equal(notes.notifications[0].thread_id,item.id);assert(!JSON.stringify(notes).includes('Two skis'));
 await post('/api/notifications','b',{postId:reply.id},notifications);assert.equal((await get('/api/notifications','a',notifications)).unread,1);
 await post('/api/notifications','a',{postId:reply.id},notifications);assert.equal((await get('/api/notifications','a',notifications)).unread,0);
 await post('/api/discussions/follow','a',{threadId:item.id,follow:false},follow);
 await post('/api/discussions/posts','b',{action:'reply',threadId:item.id,body:'No notification'},posts,201);assert.equal((await get('/api/notifications','a',notifications)).notifications.length,1);
 await post('/api/discussions/reports','b',{postId:first.id,reason:'Review this'},reports);await post('/api/discussions/reports','b',{postId:first.id,reason:'Duplicate'},reports);
 const queue=await get('/api/discussions/moderation','admin-subject',moderation);assert.equal(queue.reports.length,1);
 await post('/api/discussions/moderation','b',{action:'hide',targetId:first.id,version:2,reason:'Unauthorized'},moderation,403);
 await post('/api/discussions/moderation','admin-subject',{action:'hide',targetId:first.id,version:2,reason:'Review'},moderation);
 t=await get('/api/discussions?thread='+item.id,'b',discussions);assert.equal(t.posts[0].state,'hidden');assert.equal(t.posts[0].body,'');
 await post('/api/discussions/moderation','admin-subject',{action:'restore',targetId:first.id,version:2,reason:'Stale'},moderation,409);
 await post('/api/discussions/moderation','admin-subject',{action:'restore',targetId:first.id,version:3,reason:'Resolved'},moderation);
 await post('/api/discussions/moderation','admin-subject',{action:'resolve',targetId:queue.reports[0].id,reason:'Handled'},moderation);assert.equal((await get('/api/discussions/moderation','admin-subject',moderation)).reports.length,0);
 t=await get('/api/discussions?thread='+item.id,'a',discussions);
 await post('/api/discussions/moderation','admin-subject',{action:'lock',targetId:item.id,version:t.thread.version,reason:'Closed'},moderation);
 await post('/api/discussions/posts','b',{action:'reply',threadId:item.id,body:'Locked'},posts,409);
 await post('/api/discussions/posts','a',{action:'edit',postId:first.id,version:4,body:'Locked'},posts,409);
 await post('/api/discussions/moderation','admin-subject',{action:'unlock',targetId:item.id,version:t.thread.version+1,reason:'Reopened'},moderation);
 await post('/api/discussions/moderation','admin-subject',{action:'restrict',targetId:b.id,reason:'Abuse'},moderation);
 await post('/api/discussions/posts','b',{action:'reply',threadId:item.id,body:'Blocked'},posts,403);assert.equal((await get('/api/discussions','b',discussions)).restricted,true);
 assert.equal((await account.GET(request('/api/account','b'))).status,200);
 await post('/api/discussions/reports','b',{postId:first.id,reason:'Blocked'},reports,403);
 await post('/api/discussions/moderation','admin-subject',{action:'restrict',targetId:admin.id,reason:'Owner'},moderation,400);
 await post('/api/discussions/moderation','admin-subject',{action:'unrestrict',targetId:b.id,reason:'Restored'},moderation);
 await post('/api/discussions/posts','b',{action:'remove',postId:reply.id,version:1},posts);
 await post('/api/discussions/moderation','admin-subject',{action:'restore',targetId:reply.id,version:2,reason:'Removed'},moderation,409);
 await deletion.deleteAccount(a);
 t=await get('/api/discussions?thread='+item.id,'b',discussions);assert.equal(t.thread.title,'Thread by deleted collector');assert.equal(t.posts[0].display_name,'Deleted collector');assert.equal(t.posts[0].body,'');assert.equal(t.posts[0].state,'removed');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_revisions WHERE post_id=?').get(first.id).n,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_follows WHERE user_id=?').get(a.id).n,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM discussion_notifications WHERE user_id=?').get(a.id).n,0);
 // A restored database must reapply removal of authored discussion text even without a restored collection.
 sqlite.prepare("UPDATE discussion_posts SET body='RESTORED PRIVATE TEXT',state='visible' WHERE id=?").run(first.id);await deletion.reapplyDeletionLedger();assert.equal(sqlite.prepare('SELECT body FROM discussion_posts WHERE id=?').get(first.id).body,'');
 assert.equal((await discussions.GET(request('/api/discussions','a'))).status,403);
 // Trigger a lock immediately before the reply transaction; no partial reply or notification should survive.
 beforeBatch=()=>sqlite.prepare('UPDATE discussion_threads SET locked=1 WHERE id=?').run(item.id);
 await post('/api/discussions/posts','b',{action:'reply',threadId:item.id,body:'Racing lock'},posts,409);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM discussion_posts WHERE body='Racing lock'").get().n,0);
 assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 const now=new Date().toISOString();for(let i=0;i<55;i++)sqlite.prepare('INSERT INTO discussion_posts(id,thread_id,author_id,body,created_at) VALUES(?,?,?,?,?)').run('page-'+i,site.id,b.id,'Page '+i,now);
 const firstPage=await get('/api/discussions?thread='+site.id,'b',discussions),secondPage=await get('/api/discussions?thread='+site.id+'&offset=50','b',discussions);assert.equal(firstPage.posts.length,50);assert.equal(firstPage.hasNext,true);assert.equal(secondPage.hasNext,false);assert.equal(new Set([...firstPage.posts,...secondPage.posts].map(p=>p.id)).size,firstPage.postCount);
 const renameThread=await get('/api/discussions?thread='+site.id,'admin-subject',discussions);await post('/api/discussions/moderation','admin-subject',{action:'rename',targetId:site.id,title:'Moderated title',version:renameThread.thread.version,reason:'Title review'},moderation);assert.equal((await get('/api/discussions?thread='+site.id,'b',discussions)).thread.title,'Moderated title');
 console.log('PASS discussions: signed-in reads, shared item/site scope, private profiles, author edits/revisions, optimistic concurrency, follows/notifications, reports, moderation/restrictions, tombstones, deletion/restore, and lock race.');
})().catch(e=>{console.error(e);process.exitCode=1;});
