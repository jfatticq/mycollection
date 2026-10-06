import {env} from 'cloudflare:workers';
export function db(): D1Database {if(!env.DB)throw new Error('Collection storage unavailable');return env.DB;}
export function bucket(): R2Bucket {if(!env.BUCKET)throw new Error('Photo storage unavailable');return env.BUCKET;}
export function sameOrigin(r:Request){return r.headers.get('origin')===new URL(r.url).origin;}
