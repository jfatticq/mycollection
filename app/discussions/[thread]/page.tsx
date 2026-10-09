'use client';
import {useEffect,useState} from 'react';
import {LaunchShell,useLaunchAccount,AccessNotice} from '@/components/launch-shell';
import {DiscussionThread} from '@/components/discussion-interface';
export default function Thread(){const {account,error}=useLaunchAccount(),[id,setId]=useState('');useEffect(()=>{setId(decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop()??''));},[]);return <LaunchShell title="Discussion">{!account?<AccessNotice error={error}/>:id&&<DiscussionThread threadId={id} isAdmin={account.role==='admin'}/>}</LaunchShell>;}
