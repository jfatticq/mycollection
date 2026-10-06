import {env} from 'cloudflare:workers';
export function db(){const d=(env as any).DB;if(!d)throw new Error('Collection storage unavailable');return d;}
export function bucket(){return (env as any).BUCKET;}
export function sameOrigin(r:Request){return r.headers.get('origin')===new URL(r.url).origin;}
