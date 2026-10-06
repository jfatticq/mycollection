'use client';
import { useEffect, useState } from 'react';
import { LaunchShell, useLaunchAccount, AccessNotice } from '@/components/launch-shell';
import { requestJSON } from '@/lib/api-client';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
export default function Settings() {
    const { account, error } = useLaunchAccount();
    const [name, setName] = useState(''), [visibility, setVisibility] = useState('private'), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(false), [confirmation, setConfirmation] = useState(''), [deleted, setDeleted] = useState<any>(null);
    useEffect(() => { if (account) {
        setName(account.displayName);
        setVisibility(account.visibility);
    } }, [account]);
    useEffect(() => { if (error)
        requestJSON('/api/account/deletion').then(setDeleted).catch(() => { }); }, [error]);
    async function remove(action = 'delete') { setBusy(true); setStatus(''); try {
        setDeleted(await requestJSON('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, confirmation }) }));
        setDeleting(false);
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    return <LaunchShell title="Profile & collection settings">{deleted ? <section className="launch-panel"><h2>Account deleted</h2><p>Your collection and identifying profile details are removed from active storage. Access is revoked.</p>{deleted.cleanup === 'pending' && <><p>Photo cleanup is pending. Your photos are already unavailable to viewers.</p><button disabled={busy} className="primary" onClick={() => remove('resumeDeletion')}>Retry photo cleanup</button></>}<a href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a><p role="status">{status}</p></section> : !account ? <AccessNotice error={error}/> : <section className="launch-panel"><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setStatus(''); try {
        await requestJSON('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profile', displayName: name, visibility }) });
        setStatus('Profile and visibility saved.');
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }}><label>Collector display name<input aria-describedby="collector-name-help" required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></label><p id="collector-name-help">The name other collectors see on your profile and beside your public collection. This is not a collection title or login username. Names do not have to be unique; your login email stays private.</p><label>Collection visibility<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">Private</option><option value="public">Public to signed-in collectors</option></select></label><p>Private holdings contribute anonymous totals. Public collections show items, parts, condition and photos to signed-in collectors. Notes, location and purchase details stay private.</p><button className="primary" disabled={busy}>Save settings</button></form><p role="status">{status}</p><h2>Export & account deletion</h2><a href="/transfer">Import or export your collection</a><p>Deletion immediately revokes access and removes your active collection/profile data. Photo cleanup can be retried if storage is unavailable. A minimal deletion record prevents the account being restored accidentally. Platform-managed backup retention must be verified before launch; no backup expiry is promised here.</p>{account.role === 'admin' && <p>Deleting the catalog administrator also removes administrator access. Shared catalog records and reference photos remain archived; restoring catalog administration requires server configuration.</p>}<button className="danger" disabled={busy} onClick={() => setDeleting(true)}>Delete my account</button></section>}
 <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogTitle>Delete your account permanently?</AlertDialogTitle><AlertDialogDescription>Export first if you want a copy. This removes your collection and personal photos. You will lose access.</AlertDialogDescription><label>Type DELETE MY ACCOUNT<input value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label><p role="alert">{status}</p><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><button className="danger" disabled={busy || confirmation !== 'DELETE MY ACCOUNT'} onClick={() => remove()}>Confirm account deletion</button></AlertDialogContent></AlertDialog></LaunchShell>;
}
