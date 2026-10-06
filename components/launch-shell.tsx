'use client';
import { useEffect,useState } from 'react';
import { requestJSON } from '@/lib/api-client';
import '@/app/catalog-interface.css';
export function useLaunchAccount(){const [account,setAccount]=useState<any>(null),[error,setError]=useState('');useEffect(()=>{requestJSON('/api/account').then(setAccount).catch(e=>setError(e.message));},[]);return {account,error};}
export function LaunchShell({title,children}:{title:string;children:React.ReactNode}){return <main><header><a className="brand" href="/">G.I. JEFF'S FILES</a><nav className="account-actions" aria-label="Site"><a href="/">Catalog</a><a href="/?view=collection">My collection</a><a href="/collectors">Collectors</a><a href="/settings">Settings</a></nav></header><section className="intro"><h1>{title}</h1></section>{children}<footer>Unofficial G.I. Joe collector catalog.</footer></main>;}
export function AccessNotice({error}:{error:string}){return <section className="empty"><p role="alert">{error||'Checking sign-in…'}</p>{error&&<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a>}</section>;}
