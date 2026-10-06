'use client';
import { useEffect, useState, useId } from 'react';
import { LaunchShell, useLaunchAccount, AccessNotice } from '@/components/launch-shell';
import { requestJSON } from '@/lib/api-client';
import { releaseDraft, blankRelease, ReleaseDraft } from '@/lib/catalog-editor';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/zoomable-image';
import { CatalogHistory } from '@/components/catalog-history';
import { DeletionMaintenance } from '@/components/deletion-maintenance';
import { uploadImage } from '@/lib/media/browser-image';
function ReleasePicker({ value, onChange, label }: {
    value: string;
    onChange: (id: string) => void;
    label: string;
}) { const id = useId(), [search, setSearch] = useState(value), [rows, setRows] = useState<any[]>([]), [error, setError] = useState(''); useEffect(() => { setSearch(value); }, [value]); useEffect(() => { if (!search)
    return; const controller = new AbortController(), timer = setTimeout(() => requestJSON<any>('/api/catalog?q=' + encodeURIComponent(search) + '&limit=30', { signal: controller.signal }).then(r => { setRows(r.releases); setError(''); }).catch(e => { if (!controller.signal.aborted)
    setError(e.message); }), 250); return () => { clearTimeout(timer); controller.abort(); }; }, [search]); return <label>{label}<input list={id} value={search} onChange={e => { setSearch(e.target.value); if (rows.some(r => r.id === e.target.value) || !e.target.value)
    onChange(e.target.value); }}/><datalist id={id}>{rows.map(r => <option key={r.id} value={r.id}>{r.name} · {r.year}</option>)}</datalist><small>Search a name, then select a release ID. {value && <>Selected: {value}</>}</small>{error && <small role="alert">{error}</small>}</label>; }
export default function Admin() {
    const { account, error } = useLaunchAccount(), [rows, setRows] = useState<any[]>([]), [terms, setTerms] = useState<any[]>([]), [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [total, setTotal] = useState(0), [refresh, setRefresh] = useState(0), [edit, setEdit] = useState<ReleaseDraft | null>(null), [images, setImages] = useState<any[]>([]), [subject, setSubject] = useState('release'), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [term, setTerm] = useState<any>({ name: '', kind: 'line', parentId: null }), [merge, setMerge] = useState<any>(null), [sourceId, setSource] = useState(''), [targetId, setTarget] = useState(''), [mapping, setMapping] = useState<Record<string, string>>({});
    useEffect(() => { if (account?.role !== 'admin')
        return; const c = new AbortController(); requestJSON<any>('/api/catalog?includeRetired=true&limit=48&offset=' + offset + '&q=' + encodeURIComponent(query), { signal: c.signal }).then(r => { setRows(r.releases); setTotal(r.total); }).catch(e => { if (!c.signal.aborted)
        setStatus(e.message); }); requestJSON<any>('/api/taxonomy').then(r => setTerms(r.terms)).catch(e => setStatus(e.message)); return () => c.abort(); }, [account, query, offset, refresh]);
    async function open(id: string) { setBusy(true); setStatus(''); try {
        const d = await requestJSON<any>('/api/catalog?id=' + encodeURIComponent(id));
        setEdit(releaseDraft(d));
        setImages(d.images);
        setSubject('release');
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    function field(key: keyof ReleaseDraft, value: any) { setEdit(p => p ? { ...p, [key]: value } : null); }
    async function save() { if (!edit)
        return; setBusy(true); setStatus(''); try {
        const result = await requestJSON<any>('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: edit }) });
        setEdit({ ...edit, id: result.id, expectedRevision: result.revision });
        setRefresh(n => n + 1);
        setStatus('Published catalog changes saved.');
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function mergeAction(commit = false) { setBusy(true); setStatus(''); try {
        const r = await requestJSON<any>('/api/catalog/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: commit ? 'commit' : 'preview', sourceId, targetId, mapping, sourceRevision: merge?.source.revision, targetRevision: merge?.target.revision }) });
        if (commit) {
            setMerge(null);
            setSource('');
            setTarget('');
            setRefresh(n => n + 1);
            setStatus(`Merged ${r.impactedCopies} copies. Recorded quantities are preserved and flagged for review.`);
        }
        else {
            setMerge(r);
            setMapping({});
        }
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    return <LaunchShell title="Catalog administration">{!account ? <AccessNotice error={error}/> : account.role !== 'admin' ? <p role="alert">Only the catalog administrator can edit reference records.</p> : <><p>Saved releases publish immediately. Retire unavailable or duplicate records rather than deleting collector history.</p><div className="account-actions"><button className="primary" disabled={busy} onClick={() => { setEdit(blankRelease()); setImages([]); setSubject('release'); setStatus(''); }}>New release</button><a href="/transfer">Catalog CSV/JSON import & export</a></div><label className="search">Search catalog<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }}/></label><p role="status">{status}</p><section className="collection-grid">{rows.map(r => <article className="card" key={r.id}><div className="cardbody"><h2>{r.name}</h2><p>{r.year} · {r.line} {r.retired ? '· Retired' : ''}</p><code>{r.id}</code><button className="outline" disabled={busy} onClick={() => open(r.id)}>Edit release</button></div></article>)}</section><div className="pagination"><button disabled={!offset || busy} onClick={() => setOffset(n => Math.max(0, n - 48))}>Previous</button><span>{total} releases</span><button disabled={offset + 48 >= total || busy} onClick={() => setOffset(n => n + 48)}>Next</button></div>
 <DeletionMaintenance/><section className="launch-panel"><h2>Taxonomy</h2><label>Edit existing term<select value={term.id ?? ''} onChange={e => { const t = terms.find(t => t.id === e.target.value); setTerm(t ? { id: t.id, name: t.name, kind: t.kind, parentId: t.parent_id } : { name: '', kind: 'line', parentId: null }); }}><option value="">New term</option>{terms.map(t => <option key={t.id} value={t.id}>{t.kind}: {t.name}</option>)}</select></label><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try {
            await requestJSON('/api/taxonomy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(term) });
            setTerm({ name: '', kind: 'line', parentId: null });
            setRefresh(n => n + 1);
            setStatus('Taxonomy saved.');
        }
        catch (e: any) {
            setStatus(e.message);
        }
        finally {
            setBusy(false);
        } }}><div className="formgrid"><label>Name<input required value={term.name} maxLength={200} onChange={e => setTerm({ ...term, name: e.target.value })}/></label><label>Type<select value={term.kind} onChange={e => setTerm({ ...term, kind: e.target.value })}>{['line', 'series', 'sub_series', 'wave', 'scale', 'faction', 'market', 'manufacturer', 'other'].map(k => <option key={k}>{k}</option>)}</select></label><label>Parent<select value={term.parentId ?? ''} onChange={e => setTerm({ ...term, parentId: e.target.value || null })}><option value="">None</option>{terms.filter(t => t.id !== term.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><button className="primary" disabled={busy}>Save term</button></form></section>
 <section className="launch-panel"><h2>Merge duplicate releases</h2><p>Preview the affected copy count. Private collection details remain private. Every source part requires a unique matching target or an explicit Preserve decision.</p><div className="formgrid"><ReleasePicker label="Duplicate to retire" value={sourceId} onChange={id => { setSource(id); setMerge(null); }}/><ReleasePicker label="Surviving release" value={targetId} onChange={id => { setTarget(id); setMerge(null); }}/></div><button className="outline" disabled={busy || !sourceId || !targetId} onClick={() => mergeAction()}>Preview merge</button>{merge && <><p>{merge.impactedCopies} copies will move from {merge.source.name} to {merge.target.name}. Notes, photos and separate copies stay intact. Complete copies become Partial pending review.</p>{merge.parts.map((p: any) => <label key={p.id}>{p.name}<select value={mapping[p.id] ?? ''} onChange={e => setMapping({ ...mapping, [p.id]: e.target.value })}><option value="">Choose a mapping</option><option value="preserve">Preserve as a retired historical part</option>{merge.targetParts.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}<button className="danger" disabled={busy || merge.parts.some((p: any) => !mapping[p.id])} onClick={() => mergeAction(true)}>Confirm merge of these releases</button></>}</section>
 </>}
 <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy)
        setEdit(null); }}><DialogContent className="editor"><DialogTitle>{edit?.id ? 'Edit release' : 'New release'}</DialogTitle><DialogDescription>Save publishes changes immediately. Parts quantities are absolute totals per retail release.</DialogDescription>{edit && <><form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy}><div className="formgrid"><label>Name<input required maxLength={200} value={edit.name} onChange={e => field('name', e.target.value)}/></label><label>Item type<select value={edit.kind} onChange={e => field('kind', e.target.value)}>{['figure', 'vehicle', 'playset', 'accessory', 'multipack', 'other'].map(k => <option key={k}>{k}</option>)}</select></label><label>Release year<input type="number" min={1960} max={2200} value={edit.year ?? ''} onChange={e => field('year', e.target.value ? Number(e.target.value) : null)}/></label>{(['character', 'line', 'series', 'subSeries', 'wave', 'scale', 'faction', 'market', 'manufacturer', 'productCode', 'upc'] as const).map(k => <label key={k}>{k.replace(/([A-Z])/g, ' $1')}<input maxLength={200} value={edit[k] ?? ''} onChange={e => field(k, e.target.value || null)}/></label>)}<label>Original retail price (cents)<input type="number" min={0} step={1} value={edit.retailPriceCents ?? ''} onChange={e => field('retailPriceCents', e.target.value ? Number(e.target.value) : null)}/></label><label>Retail currency<input maxLength={3} pattern="[A-Z]{3}" value={edit.retailCurrency ?? ''} onChange={e => field('retailCurrency', e.target.value.toUpperCase() || null)}/></label><label><input type="checkbox" checked={edit.retired} onChange={e => field('retired', e.target.checked)}/> Retired from new additions</label></div><h3>Taxonomy associations</h3><div className="check-list">{terms.map(t => <label key={t.id}><input type="checkbox" checked={edit.taxonomyIds.includes(t.id)} onChange={e => field('taxonomyIds', e.target.checked ? [...edit.taxonomyIds, t.id] : edit.taxonomyIds.filter(id => id !== t.id))}/>{t.kind}: {t.name}</label>)}</div>
 <h3>Expected parts</h3><p>Primary parts confirm ownership of the toy. Use accessory for a vehicle driver or loose gear; multipack figures and vehicles may be primary parts. Packaging and paperwork have their own quantities and grades. Nesting groups parts without multiplying quantities.</p>{edit.parts.map((p, i) => <section className="part-admin" key={p.id}><div className="formgrid"><label>Name<input required maxLength={200} value={p.name} onChange={e => field('parts', edit.parts.map((v, j) => j === i ? { ...v, name: e.target.value } : v))}/></label><label>Part type<select value={p.kind} onChange={e => field('parts', edit.parts.map((v, j) => j === i ? { ...v, kind: e.target.value } : v))}>{['primary', 'accessory', 'packaging', 'paperwork'].map(k => <option key={k}>{k}</option>)}</select></label><label>Expected quantity<input type="number" min={0} max={9999} placeholder="Unknown" value={p.expectedQuantity ?? ''} onChange={e => field('parts', edit.parts.map((v, j) => j === i ? { ...v, expectedQuantity: e.target.value === '' ? null : Number(e.target.value) } : v))}/></label><label>Parent part<select value={p.parentId ?? ''} onChange={e => field('parts', edit.parts.map((v, j) => j === i ? { ...v, parentId: e.target.value || null } : v))}><option value="">None</option>{edit.parts.filter(v => v.id !== p.id).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Linked release ID (optional)<input value={p.linkedReleaseId ?? ''} maxLength={128} onChange={e => field('parts', edit.parts.map((v, j) => j === i ? { ...v, linkedReleaseId: e.target.value || null } : v))}/></label></div><small>Stable part ID: {p.id}</small><button type="button" className="danger" disabled={edit.parts.some(v => v.parentId === p.id)} onClick={() => field('parts', edit.parts.filter((_, j) => j !== i))}>Retire this part</button></section>)}<button type="button" className="outline" onClick={() => field('parts', [...edit.parts, { id: crypto.randomUUID(), parentId: null, name: '', kind: 'accessory', expectedQuantity: null, sortOrder: edit.parts.length, linkedReleaseId: null }])}>Add part</button>
 <h3>File cards</h3>{edit.fileCards.map((c, i) => <label key={c.id}>File-card text<textarea maxLength={30000} rows={5} value={c.text} onChange={e => field('fileCards', edit.fileCards.map((v, j) => j === i ? { ...v, text: e.target.value } : v))}/><button type="button" className="danger" onClick={()=>field("fileCards",edit.fileCards.filter((_,j)=>j!==i))}>Remove file card</button></label>)}<button className="outline" type="button" onClick={() => field('fileCards', [...edit.fileCards, { id: crypto.randomUUID(), text: '' }])}>Add file card</button>
 <h3>Related releases & variants</h3>{edit.related.map((r, i) => <div className="formgrid" key={i}><ReleasePicker label="Related release" value={r.id} onChange={id => field('related', edit.related.map((v, j) => j === i ? { ...v, id } : v))}/><label>Relationship<select value={r.kind} onChange={e => field('related', edit.related.map((v, j) => j === i ? { ...v, kind: e.target.value } : v))}>{['variant', 'repaint', 'international', 'packaging', 'related'].map(k => <option key={k}>{k}</option>)}</select></label><button type="button" className="danger" onClick={() => field('related', edit.related.filter((_, j) => j !== i))}>Remove relationship</button></div>)}<button type="button" className="outline" onClick={() => field('related', [...edit.related, { id: '', kind: 'variant' }])}>Link a release</button>
 </fieldset><p role="status">{status}</p><button className="primary" disabled={busy}>Save published release</button><button type="button" className="outline" disabled={busy} onClick={() => setEdit(null)}>Close</button></form>
 {edit.id&&<CatalogHistory id={edit.id}/>}<h3>Reference photos</h3>{!edit.id ? <p>Save the release before adding photos.</p> : <><label>Photo subject<select value={subject} onChange={e => setSubject(e.target.value)}><option value="release">Release</option>{edit.parts.map(p => <option key={p.id} value={'part:' + p.id}>Part: {p.name}</option>)}{edit.fileCards.map((c, i) => <option key={c.id} value={'card:' + c.id}>File card {i + 1}</option>)}</select></label><input aria-label="Upload catalog photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !edit.id)
            return; setBusy(true); try {
            const form = new FormData();
            form.set('scope', 'catalog');
            form.set('file', await uploadImage(file));
            const result = await requestJSON<any>('/api/photo', { method: 'POST', body: form });
            const target = subject === 'release' ? { releaseId: edit.id } : subject.startsWith('part:') ? { partId: subject.slice(5) } : { fileCardId: subject.slice(5) };
            await requestJSON('/api/media/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId: result.id, ...target, sortOrder: images.length, primary: images.length === 0 }) });
            const d = await requestJSON<any>('/api/catalog?id=' + edit.id);
            setImages(d.images);
            setStatus('Catalog photo attached.');
        }
        catch (e: any) {
            setStatus(e.message);
        }
        finally {
            setBusy(false);
        } }}/><p>Save new parts and file cards before selecting them as photo subjects.</p><div className="owner-photo-grid">{images.map(image => <div key={image.link_id}><ZoomableImage src={image.url} title="Catalog photo"/><p>{image.part_id ? edit.parts.find(p => p.id === image.part_id)?.name : image.file_card_id ? 'File card' : 'Release'}</p><button className="danger" disabled={busy} onClick={async () => { setBusy(true); try {
            await requestJSON('/api/media/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlink', mediaId: image.id,linkId:image.link_id }) });
            setImages(images.filter(v => v.link_id !== image.link_id));
        }
        catch (e: any) {
            setStatus(e.message);
        }
        finally {
            setBusy(false);
        } }}>Remove reference link</button>{image.release_id&&<button className="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await requestJSON("/api/media/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cover",mediaId:image.id,releaseId:edit.id})});setStatus("Catalog cover updated.");}catch(e:any){setStatus(e.message);}finally{setBusy(false);}}}>Make catalog cover</button>}</div>)}</div></>}
 </>}</DialogContent></Dialog>
 </LaunchShell>;
}
