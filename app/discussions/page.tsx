'use client';
import {useEffect,useState} from 'react';
import {LaunchShell,useLaunchAccount,AccessNotice} from '@/components/launch-shell';
import {DiscussionFeed} from '@/components/discussion-interface';
export default function Discussions(){const {account,error}=useLaunchAccount(),[release,setRelease]=useState<string|undefined>();useEffect(()=>{setRelease(new URLSearchParams(window.location.search).get('release')??undefined);},[]);return <LaunchShell title="Discussions">{!account?<AccessNotice error={error}/>:<><div className="discussion-actions"><a href="/notifications">Notifications</a>{account.role==='admin'&&<a className="admin-link" href="/discussions/moderation">Moderation <span className="admin-link-label">Admin</span></a>}</div><DiscussionFeed releaseId={release}/></>}</LaunchShell>;}
