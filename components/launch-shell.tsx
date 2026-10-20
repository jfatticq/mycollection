'use client';
import { useCollectorAccount } from '@/components/collector-account';
import { SiteHeader } from '@/components/site-header';
import '@/app/catalog-interface.css';
export const useLaunchAccount = useCollectorAccount;
export function LaunchShell({title,children}:{title:string;children:React.ReactNode}){return <main><SiteHeader/><section className="intro"><h1>{title}</h1></section>{children}<footer>Unofficial G.I. Joe collector catalog.</footer></main>;}
export function AccessNotice({error}:{error:string}){return <section className="empty"><p role="alert">{error||'Checking sign-in…'}</p>{error&&<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a>}</section>;}
