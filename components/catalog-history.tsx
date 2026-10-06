'use client';
import { useState } from 'react';
import { requestJSON } from '@/lib/api-client';
export function CatalogHistory({id}:{id:string}){const [rows,setRows]=useState<any[]|null>(null),[error,setError]=useState('');return <details onToggle={e=>{if(e.currentTarget.open)requestJSON<any>('/api/catalog/history?id='+encodeURIComponent(id)).then(r=>setRows(r.revisions)).catch(e=>setError(e.message));}}><summary>Catalog revision history</summary><p role="alert">{error}</p>{rows?.map(r=><details key={r.revision}><summary>Revision {r.revision} · {r.created_at}</summary><pre className="history-snapshot">{JSON.stringify(JSON.parse(r.snapshot),null,2)}</pre></details>)}</details>;}
