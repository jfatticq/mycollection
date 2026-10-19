'use client';
import { CollectorAccountMenu, useCollectorAccount } from '@/components/collector-account';
import '@/app/catalog-interface.css';
export const useLaunchAccount = useCollectorAccount;
export function LaunchShell({title,children}:{title:string;children:React.ReactNode}){return <main><header className="collector-site-header"><a className="brand" href="/">G.I. JEFF</a><nav className="account-actions" aria-label="Site"><a href="/">Catalog</a><a href="/?view=collection">My collection</a><a href="/collectors">Collectors</a><a href="/discussions">Discussions</a><a href="/notifications">Notifications</a><a href="/settings">Settings</a></nav><CollectorAccountMenu/></header><section className="intro"><h1>{title}</h1></section>{children}<footer>Unofficial G.I. Joe collector catalog.</footer></main>;}
export function AccessNotice({error}:{error:string}){return <section className="empty"><p role="alert">{error||'Checking sign-in…'}</p>{error&&<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a>}</section>;}
