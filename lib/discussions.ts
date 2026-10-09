import { db } from '@/lib/db';
import { Actor, AccessError } from '@/lib/auth/access';
import { boundedBytes } from '@/lib/limits';
export function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AccessError(400,`${label} must contain 1–${max} characters.`);
  return value.trim();
}
export function id(value: unknown) { return text(value,'Identifier',128); }
export function requestId(value:unknown) {if(value===undefined)return crypto.randomUUID();if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw new AccessError(400,'Invalid request identifier.');return value;}
export function page(value: string|null) { const n=value===null?0:Number(value);if(!Number.isInteger(n)||n<0||n>100000)throw new AccessError(400,'Invalid page.');return n; }
export async function input(request:Request) {const b=JSON.parse(new TextDecoder().decode(await boundedBytes(request,32768)));if(!b||typeof b!=='object'||Array.isArray(b))throw new AccessError(400,'Invalid request.');return b;}
export async function writable(a:Actor) {if(await db().prepare('SELECT user_id FROM discussion_restrictions WHERE user_id=?').bind(a.id).first())throw new AccessError(403,'Your account can read discussions but cannot post or report. Contact the catalog administrator.');}
export async function thread(threadId:string) {const t=await db().prepare('SELECT t.*,r.name AS release_name FROM discussion_threads t LEFT JOIN catalog_releases r ON r.id=t.release_id WHERE t.id=?').bind(threadId).first<any>();if(!t)throw new AccessError(404,'Thread not found.');return t;}
export function version(value:unknown) {if(!Number.isInteger(value)||Number(value)<1)throw new AccessError(400,'Current version required.');return Number(value);}
export function activeWriter(alias:string) {return `EXISTS(SELECT 1 FROM users u WHERE u.id=${alias} AND u.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM discussion_restrictions x WHERE x.user_id=${alias})`;}
export async function ensureChanged(result:any) {if(!result?.meta?.changes)throw new AccessError(409,'This discussion changed. Reload before trying again.');}
// Remove authored free text, including revisions and thread titles, rather than merely renaming a deleted author.
export function deletionStatements(userId:string) {
  const s=db();return [
    s.prepare("UPDATE discussion_threads SET title='Thread by deleted collector',version=version+1 WHERE author_id=?").bind(userId),
    s.prepare("UPDATE discussion_posts SET body='',state='removed',version=version+1 WHERE author_id=?").bind(userId),
    s.prepare('DELETE FROM discussion_revisions WHERE post_id IN (SELECT id FROM discussion_posts WHERE author_id=?)').bind(userId),
    s.prepare('DELETE FROM discussion_reports WHERE reporter_id=?').bind(userId),
    s.prepare("UPDATE discussion_reports SET reason='Reported post removed on account deletion' WHERE post_id IN (SELECT id FROM discussion_posts WHERE author_id=?)").bind(userId),
    s.prepare("UPDATE discussion_moderation SET reason='Removed on account deletion' WHERE actor_id=?").bind(userId),
    s.prepare("UPDATE discussion_moderation SET reason='Removed on account deletion' WHERE target_id=? OR target_id IN (SELECT id FROM discussion_posts WHERE author_id=?) OR target_id IN (SELECT id FROM discussion_threads WHERE author_id=?)").bind(userId,userId,userId),
    s.prepare('DELETE FROM discussion_follows WHERE user_id=?').bind(userId),
    s.prepare('DELETE FROM discussion_notifications WHERE user_id=?').bind(userId),
    s.prepare('DELETE FROM discussion_restrictions WHERE user_id=?').bind(userId),
  ];
}
