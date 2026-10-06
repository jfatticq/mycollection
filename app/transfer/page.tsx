'use client';
import { useState } from 'react';
import { LaunchShell, useLaunchAccount, AccessNotice } from '@/components/launch-shell';
import { requestJSON } from '@/lib/api-client';
export default function Transfer() {
    const { account, error } = useLaunchAccount(), [kind, setKind] = useState('collection'), [format, setFormat] = useState('json'), [text, setText] = useState(''), [preview, setPreview] = useState<any>(null), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
    async function action(commit = false) { setBusy(true); setStatus(''); try {
        const result = await requestJSON<any>('/api/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(commit ? { action: 'commit', previewId: preview.previewId } : { action: 'preview', kind, format, text }) });
        if (commit) {
            setPreview(null);
            setStatus(`Imported ${result.imported ?? 0} records.`);
        }
        else
            setPreview(result);
    }
    catch (e: any) {
        setStatus(e.message);
        if (!commit)
            setPreview(null);
    }
    finally {
        setBusy(false);
    } }
    return <LaunchShell title="Import & export">{!account ? <AccessNotice error={error}/> : <section className="launch-panel"><p>Version 1 files · maximum 50 rows and 2 MB per import. Blank quantities mean unknown; zero means absent. Existing IDs update your records; missing IDs create separate copies. Import never replaces another collector's data.</p><div className="formgrid"><label>Data<select value={kind} onChange={e => { setKind(e.target.value); setPreview(null); setText(''); }}><option value="collection">My collection</option>{account.role === 'admin' && <option value="catalog">Reference catalog</option>}</select></label><label>Format<select value={format} onChange={e => { setFormat(e.target.value); setPreview(null); setText(''); }}><option value="json">JSON</option><option value="csv">CSV</option></select></label></div><p className="account-actions"><a href={`/api/transfer?kind=${kind}&format=${format}&template=true`}>Download template</a><a href={`/api/transfer?kind=${kind}&format=${format}`}>Export {kind}</a><a href={`/api/transfer?kind=${kind}&format=json`}>Export JSON with photo mapping</a></p><p>CSV stores parts and other arrays as JSON inside quoted cells. Photo contents are handled separately; JSON exports include a mapping to stable entry/subject IDs. Upload photos after importing. <a href="/transfer-guide.html" target="_blank">File format guide</a></p><label>Choose a file<input type="file" accept=".csv,.json" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; setPreview(null); if (!file)
        return; if (file.size > 2 * 1024 * 1024) {
        setStatus('Use a file under 2 MB.');
        return;
    } setText(await file.text()); }}/></label><label>File contents<textarea rows={10} value={text} disabled={busy} onChange={e => { setText(e.target.value); setPreview(null); }}/></label><button className="primary" disabled={busy || !text} onClick={() => action()}>Validate & preview</button><p role="status">{status}</p>{preview && <><h2>Import preview</h2>{preview.errors.length ? <ul role="alert">{preview.errors.map((e: any, i: number) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul> : <><p>No records have been saved. This preview expires in 30 minutes.</p><div className="table-scroll"><table><thead><tr><th>Action</th><th>Name</th><th>Stable ID</th><th>Validated fields</th></tr></thead><tbody>{preview.rows.map((r: any) => <tr key={r.id}><td>{r.action}</td><td>{r.name}</td><td><code>{r.id}</code></td><td><details><summary>Review proposed data</summary><pre className="history-snapshot">{JSON.stringify(r.item,null,2)}</pre></details></td></tr>)}</tbody></table></div><button disabled={busy} className="primary" onClick={() => action(true)}>Commit {preview.rows.length} records</button></>}</>}</section>}</LaunchShell>;
}
