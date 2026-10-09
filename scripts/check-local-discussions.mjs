// Local preview only. This run cleans up exactly its own thread and posts in the isolated SQLite database.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const base=new URL(process.argv[2]??'');
if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Local preview URL required.');
const root=resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files=readdirSync(root).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');if(files.length!==1)throw Error('Expected one isolated local database.');
const database=new DatabaseSync(join(root,files[0]));database.exec('PRAGMA foreign_keys=ON');
const signIn=await fetch(new URL('/signin-with-chatgpt?return_to=%2Fdiscussions',base),{redirect:'manual'});assert.equal(signIn.status,302);const cookie=signIn.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert(cookie);
async function api(path,body){const r=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{Origin:base.origin,'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const data=await r.json();assert(r.ok,path+': '+JSON.stringify(data));return data;}
const threadId=crypto.randomUUID();
try{
 const created=await api('/api/discussions',{title:'Local discussion check',body:'Local initial post <script>plain text</script>',requestId:threadId});assert.equal(created.id,threadId);
 assert.equal((await api('/api/discussions',{title:'Local discussion check',body:'Local initial post <script>plain text</script>',requestId:threadId})).id,threadId);
 let thread=await api('/api/discussions?thread='+threadId);assert.equal(thread.posts.length,1);assert(thread.following);
 const replyId=crypto.randomUUID();await api('/api/discussions/posts',{action:'reply',threadId,body:'Local reply',requestId:replyId});await api('/api/discussions/posts',{action:'reply',threadId,body:'Local reply',requestId:replyId});
 thread=await api('/api/discussions?thread='+threadId);assert.equal(thread.posts.length,2);assert.equal(thread.posts[1].id,replyId);
 await api('/api/discussions/posts',{action:'edit',postId:replyId,version:1,body:'Edited local reply'});
 await api('/api/discussions/posts',{action:'remove',postId:replyId,version:2});thread=await api('/api/discussions?thread='+threadId);assert.equal(thread.posts[1].body,'');assert.equal(thread.posts[1].state,'removed');
 await api('/api/discussions/follow',{threadId,follow:false});assert.equal((await api('/api/discussions?thread='+threadId)).following,false);
 await api('/api/notifications');
 for(const path of ['/discussions','/discussions/'+threadId,'/notifications','/discussions/moderation']){const r=await fetch(new URL(path,base),{headers:{Cookie:cookie},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200);assert((await r.text()).includes('G.I. JEFF'));}
 console.log('PASS local HTTP: real D1 discussions, sign-in, replay-safe thread/reply creation, chronological posts, edit/removal, follow, notifications, and four page routes.');
}finally{
 database.exec('BEGIN');try{
 for(const table of ['discussion_notifications','discussion_follows'])database.prepare('DELETE FROM '+table+' WHERE thread_id=?').run(threadId);
 for(const table of ['discussion_reports','discussion_revisions'])database.prepare('DELETE FROM '+table+' WHERE post_id IN (SELECT id FROM discussion_posts WHERE thread_id=?)').run(threadId);
 database.prepare('DELETE FROM discussion_posts WHERE thread_id=?').run(threadId);database.prepare('DELETE FROM discussion_threads WHERE id=?').run(threadId);database.exec('COMMIT');
 }catch(e){database.exec('ROLLBACK');throw e;}finally{database.close();}
}
