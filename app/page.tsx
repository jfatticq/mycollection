'use client';
import { useEffect, useRef, useState } from 'react';
import { Package, Search, Shield, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { CollectionPhoto } from '@/components/collection-photo';
import { ZoomableImage } from '@/components/zoomable-image';
import { ReleaseCounts } from '@/components/release-counts';
import { ProfileSetup } from '@/components/profile-setup';
import { ConditionGuide } from '@/components/condition-guide';
import { PartCondition } from '@/components/part-condition';
import { uploadImage } from '@/lib/media/browser-image';
import { requestJSON, ApiError } from '@/lib/api-client';
import { newDraft, draftFromEntry, quickChoice, nullableQuantity } from '@/lib/collection/editor';
import type { EntryDraft, OwnedEntry, Release, CatalogDetail } from '@/lib/collection/editor';
import './catalog-interface.css';
type Account = {
    userId: string;
    collectionId: string;
    role: 'admin' | 'collector';
    needsSetup: boolean;
};
type CatalogPage = {
    releases: Release[];
    total: number;
    lines: string[];
    years: number[];
};
const emptyCatalog: CatalogPage = { releases: [], total: 0, lines: [], years: [] };
const conditionHelp = { Mint: 'No visible wear or damage. Sealed status is recorded separately.', Excellent: 'Very light wear; no significant damage.', Good: 'Noticeable wear but generally intact.', Fair: 'Heavy wear or damage that affects appearance or function.', Poor: 'Severe wear or damage; significant repairs may be needed.', Unknown: 'Condition has not been assessed.' };
const signIn = '/signin-with-chatgpt?return_to=%2F';
function message(e: unknown) { return e instanceof Error ? e.message : 'Please retry.'; }
export default function Home() {
    const detailRequest = useRef(0);
    const [metadata, setMetadata] = useState<Record<string, string>>({}), [terms, setTerms] = useState<any[]>([]), [sort, setSort] = useState('year'), [gradeFilter, setGradeFilter] = useState(''), [completeFilter, setCompleteFilter] = useState(''), [reviewFilter, setReviewFilter] = useState(false), [missingFilter, setMissingFilter] = useState(false), [locationFilter, setLocationFilter] = useState('');
    const [account, setAccount] = useState<Account | null>(null), [accountLoading, setAccountLoading] = useState(true), [accountError, setAccountError] = useState('');
    const [view, setView] = useState('catalog'), [query, setQuery] = useState(''), [line, setLine] = useState(''), [year, setYear] = useState(''), [offset, setOffset] = useState(0);
    const [catalog, setCatalog] = useState<CatalogPage>(emptyCatalog), [catalogLoading, setCatalogLoading] = useState(true), [catalogError, setCatalogError] = useState(''), [refresh, setRefresh] = useState(0);
    const [items, setItems] = useState<OwnedEntry[]>([]), [collectionLoading, setCollectionLoading] = useState(false), [collectionError, setCollectionError] = useState('');
    const [detail, setDetail] = useState<CatalogDetail | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
    const [edit, setEdit] = useState<EntryDraft | null>(null), [editCatalog, setEditCatalog] = useState<CatalogDetail | null>(null), [labels, setLabels] = useState<Record<string, string>>({}), [editError, setEditError] = useState(''), [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [looseName, setLooseName] = useState('');
    async function loadAccount() {
        setAccountLoading(true);
        setAccountError('');
        try {
            setAccount(await requestJSON<Account>('/api/account'));
        }
        catch (e) {
            setAccount(null);
            if (!(e instanceof ApiError && e.status === 401))
                setAccountError(message(e));
        }
        finally {
            setAccountLoading(false);
        }
    }
    async function loadCollection() {
        setCollectionLoading(true);
        setCollectionError('');
        try {
            const result = await requestJSON<{
                items: OwnedEntry[];
            }>('/api/collection');
            setItems(result.items);
        }
        catch (e) {
            setItems([]);
            setCollectionError(message(e));
        }
        finally {
            setCollectionLoading(false);
        }
    }
    useEffect(() => {
        void loadAccount();
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'collection')
            setView('collection');
        if (params.get('release'))
            void openRelease(params.get('release')!);
    }, []);
    useEffect(() => { requestJSON<any>('/api/taxonomy').then(r => setTerms(r.terms)).catch(() => { }); }, []);
    useEffect(() => {
        if (account)
            void loadCollection();
        else
            setItems([]);
    }, [account?.userId]);
    useEffect(() => { setOffset(0); }, [query, line, year, view, metadata, sort]);
    useEffect(() => {
        if (view === 'collection')
            return;
        if (view === 'unowned' && !account) {
            setCatalogLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setCatalogLoading(true);
            setCatalogError('');
            const p = new URLSearchParams({ q: query, limit: '48', offset: String(offset) });
            p.set('sort', sort);
            Object.entries(metadata).forEach(([key, value]) => { if (value)
                p.set(key, value); });
            if (line)
                p.set('line', line);
            if (year)
                p.set('year', year);
            if (view === 'unowned')
                p.set('ownership', 'unowned');
            requestJSON<CatalogPage>('/api/catalog?' + p, { signal: controller.signal }).then(result => {
                if (!controller.signal.aborted)
                    setCatalog(result);
            }).catch(e => {
                if (!controller.signal.aborted)
                    setCatalogError(message(e));
            }).finally(() => {
                if (!controller.signal.aborted)
                    setCatalogLoading(false);
            });
        }, 180);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query, line, year, view, offset, refresh, account?.userId, metadata, sort]);
    async function openRelease(id: string) {
        const requestId = ++detailRequest.current;
        setDetail(null);
        setDetailError('');
        setDetailLoading(true);
        try {
            const result = await requestJSON<CatalogDetail>('/api/catalog?id=' + encodeURIComponent(id));
            if (requestId === detailRequest.current)
                setDetail(result);
        }
        catch (e) {
            if (requestId === detailRequest.current)
                setDetailError(message(e));
        }
        finally {
            if (requestId === detailRequest.current)
                setDetailLoading(false);
        }
    }
    async function startEntry(release: CatalogDetail) {
        if (!account)
            return;
        setDetail(null);
        setEditCatalog(release);
        setLabels(Object.fromEntries(release.parts.map(p => [p.id, p.name])));
        setEditError('');
        setLooseName('');
        setEdit(newDraft(release));
    }
    async function openEntry(entry: OwnedEntry) {
        setEditError('');
        setLooseName('');
        setEditCatalog(null);
        setLabels(Object.fromEntries(entry.parts.map(p => [p.partId, p.label])));
        setEdit(draftFromEntry(entry));
        if (entry.releaseId) {
            setBusy(true);
            try {
                const d = await requestJSON<CatalogDetail>('/api/catalog?id=' + encodeURIComponent(entry.releaseId));
                setEditCatalog(d);
                setLabels(previous => ({ ...previous, ...Object.fromEntries(d.parts.map(p => [p.id, p.name])) }));
                setEdit(previous => previous && previous.id === entry.id ? { ...previous, reviewedRevision: previous.reviewedRevision === d.release.revision ? previous.reviewedRevision : null, parts: [...previous.parts, ...d.parts.filter(p => !previous.parts.some(q => q.partId === p.id)).map(p => ({ partId: p.id, quantity: null, condition: null, defects: '' }))] } : previous);
            }
            catch (e) {
                setEditError(message(e));
            }
            finally {
                setBusy(false);
            }
        }
    }
    function field<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) { setEdit(previous => previous ? { ...previous, [key]: value } : null); }
    async function save() {
        if (!edit || busy)
            return;
        setBusy(true);
        setEditError('');
        try {
            const saved = await requestJSON<{
                item: OwnedEntry;
            }>('/api/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', item: edit }) });
            setItems(previous => [...previous.filter(p => p.id !== saved.item.id), saved.item]);
            setEdit(null);
            setRefresh(r => r + 1);
        }
        catch (e) {
            setEditError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function remove() {
        if (!edit?.id)
            return;
        setBusy(true);
        setEditError('');
        try {
            await requestJSON('/api/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', item: { id: edit.id } }) });
            setItems(previous => previous.filter(p => p.id !== edit.id));
            setEdit(null);
            setRefresh(r => r + 1);
        }
        catch (e) {
            setEditError(message(e));
        }
        finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    }
    const owned = new Set(items.filter(e => e.ownership === 'owned').map(e => e.releaseId));
    const filteredItems = items.filter(e => (!line || e.line === line) && (!year || String(e.year) === year) && (!gradeFilter || e.condition === gradeFilter) && (!completeFilter || e.completeness === completeFilter) && (!reviewFilter || e.needsReview) && (!missingFilter || e.parts.some(p => p.quantity !== null && (p as any).expectedQuantity !== null && p.quantity < (p as any).expectedQuantity)) && (!locationFilter || (e.location ?? '').toLowerCase().includes(locationFilter.toLowerCase())) && Object.entries(metadata).every(([key, value]) => !value || (key === 'taxonomyId' ? (e as any).taxonomyIds?.includes(value) : String((e as any)[key] ?? '') === value)) && Object.values(e).filter(v => typeof v === 'string' || typeof v === 'number').join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'newest' ? (b.year ?? 0) - (a.year ?? 0) : (a.year ?? 0) - (b.year ?? 0));
    const lines = [...new Set([...catalog.lines, ...items.map(e => e.line).filter((l): l is string => !!l)])].sort();
    const years = [...new Set([...catalog.years, ...items.map(e => e.year).filter((y): y is number => y !== null)])].sort((a, b) => a - b);
    return <main>
    <header><a className="brand" href="/"><Shield size={30}/><span>G.I. JEFF'S <b>FILES</b></span></a><div className="account-actions">{account ? <><a href="/collectors">Collectors</a><a href="/settings">Settings</a><a href="/transfer">Import / export</a>{account.role === 'admin' && <a href="/admin">Manage catalog</a>}<a href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a></> : <a className="primary" href={signIn} target="_top">Sign in</a>}</div></header>
    {account?.needsSetup && <ProfileSetup onSave={() => void loadAccount()}/>}
    <section className="intro"><div><p className="eyebrow">COLLECTOR FILES</p><h1>{view === 'collection' ? 'My collection' : view === 'unowned' ? 'Unowned releases' : 'Reference catalog'}</h1><p className="sub">{view === 'collection' ? 'Each copy has its own condition, parts and photos.' : 'Explore figures, vehicles, playsets and their parts.'}</p></div>{account && <button className="primary" onClick={() => { setEditCatalog(null); setLabels({}); setEditError(''); setLooseName(''); setEdit(newDraft()); }}><Plus size={18}/> Add unidentified item</button>}</section>
    {accountError && <p role="alert" className="notice">{accountError} <button onClick={loadAccount}>Retry sign-in check</button></p>}
    {account && <section className="stats"><div><span>OWNED COPIES</span><strong>{items.filter(e => e.ownership === 'owned').length}</strong></div><div><span>PARTS-ONLY HOLDINGS</span><strong>{items.filter(e => e.ownership === 'parts_only').length}</strong></div><div><span>OWNERSHIP UNCONFIRMED</span><strong>{items.filter(e => e.ownership === 'unconfirmed').length}</strong></div><div><span>COLLECTION RECORDS</span><strong>{items.length}</strong></div></section>}
    <nav className="toolbar" aria-label="Catalog and collection views"><div className="view-tabs">{[['catalog', 'Reference catalog'], ['collection', 'My collection'], ['unowned', 'Unowned releases']].map(([id, title]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{title}</button>)}</div><span className="count">{view === 'collection' ? filteredItems.length : catalog.total} results</span></nav>
    <section className="filters"><label className="search"><Search size={19}/><input aria-label="Search" placeholder={view === 'collection' ? 'Search items, metadata or private notes…' : 'Search a name, character or product code…'} value={query} onChange={e => setQuery(e.target.value)}/></label><details className="filter-details"><summary>Filters</summary><div><label>Toy line<select value={line} onChange={e => setLine(e.target.value)}><option value="">All lines</option>{lines.map(l => <option key={l}>{l}</option>)}</select></label><label>Release year<select value={year} onChange={e => setYear(e.target.value)}><option value="">All years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label><label>Sort<select value={sort} onChange={e => setSort(e.target.value)}><option value="year">Year, oldest first</option><option value="newest">Year, newest first</option><option value="name">Name</option></select></label><label>Item type<select value={metadata.kind ?? ''} onChange={e => setMetadata({ ...metadata, kind: e.target.value })}><option value="">All types</option>{['figure', 'vehicle', 'playset', 'accessory', 'multipack', 'other'].map(k => <option key={k}>{k}</option>)}</select></label>{['series', 'sub_series', 'wave', 'scale', 'faction', 'market', 'manufacturer'].map(k => <label key={k}>{k.replaceAll('_', ' ')}<input value={metadata[k] ?? ''} onChange={e => setMetadata({ ...metadata, [k]: e.target.value })} placeholder="Exact metadata value"/></label>)}<label>Taxonomy<select value={metadata.taxonomyId ?? ''} onChange={e => setMetadata({ ...metadata, taxonomyId: e.target.value })}><option value="">Any term</option>{terms.map(t => <option key={t.id} value={t.id}>{t.kind}: {t.name}</option>)}</select></label>{view === 'collection' && <><label>Condition<select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}><option value="">Any condition</option>{Object.keys(conditionHelp).map(g => <option key={g}>{g}</option>)}</select></label><label>Completeness<select value={completeFilter} onChange={e => setCompleteFilter(e.target.value)}><option value="">Any completeness</option>{['Complete', 'Partial', 'Not sure'].map(g => <option key={g}>{g}</option>)}</select></label><label>Storage location<input value={locationFilter} onChange={e => setLocationFilter(e.target.value)}/></label><label><input type="checkbox" checked={reviewFilter} onChange={e => setReviewFilter(e.target.checked)}/> Needs parts review</label><label><input type="checkbox" checked={missingFilter} onChange={e => setMissingFilter(e.target.checked)}/> Known missing parts</label></>}<button className="outline" onClick={() => { setLine(''); setYear(''); setMetadata({}); setGradeFilter(''); setCompleteFilter(''); setLocationFilter(''); setReviewFilter(false); setMissingFilter(false); }}>Clear filters</button></div></details></section>
    {view !== 'catalog' && !account ? <section className="empty"><Package size={40}/><h2>{accountLoading ? 'Checking sign-in…' : 'Sign in to view your collection'}</h2><p>Your records are private by default.</p><a className="primary" href={signIn} target="_top">Sign in with ChatGPT</a></section> : view === 'collection' ? <>
      {collectionError && <p className="notice" role="alert">{collectionError} <button onClick={loadCollection}>Retry</button></p>}
      {collectionLoading ? <p role="status">Loading your collection…</p> : !filteredItems.length ? <section className="empty"><Package size={40}/><h2>{items.length ? 'No matching items' : 'Your collection starts here'}</h2><p>Browse the catalog to add a release, or record an unidentified item.</p><button className="primary" onClick={() => { setView('catalog'); setQuery(''); }}>Browse catalog</button></section> : <section className="collection-grid">{filteredItems.map(entry => <article className="card" key={entry.id}><button className="photo" aria-label={'View ' + entry.name} onClick={() => openEntry(entry)}>{entry.photos?.[0] ? <img src={entry.photos[0]} alt={entry.name}/> : <Package size={44}/>}</button><div className="cardbody"><p className="meta">{entry.year ?? 'Year unknown'} · {entry.line ?? 'Unidentified'}</p><h2>{entry.name}</h2><p className="condition">{entry.condition} · {entry.completeness}</p><p>{entry.ownership === 'parts_only' ? 'Parts only' : entry.ownership === 'unconfirmed' ? 'Ownership unconfirmed' : 'Owned copy'}{entry.needsReview ? ' · Parts need review' : ''}</p><button className="outline cardaction" onClick={() => openEntry(entry)}>View &amp; edit</button></div></article>)}</section>}
    </> : <>
      {catalogError && <p className="notice" role="alert">{catalogError} <button onClick={() => setRefresh(r => r + 1)}>Retry</button></p>}
      {catalogLoading ? <p role="status">Loading catalog…</p> : !catalog.releases.length && !catalogError ? <section className="empty"><Package size={40}/><h2>{query || line || year ? 'No matching releases' : view === 'unowned' ? 'No unowned releases found' : 'No releases have been added yet'}</h2><p>{query || line || year ? 'Try another search or clear the filters.' : 'Catalog records will appear here when the catalog owner adds them.'}</p></section> : <section className="collection-grid">{catalog.releases.map(release => <article className="card" key={release.id}><button className="photo" aria-label={'View ' + release.name} onClick={() => openRelease(release.id)}>{release.image_id ? <img src={'/api/photo?id=' + release.image_id} alt={release.name} loading="lazy"/> : <Package size={44}/>}</button><div className="cardbody"><p className="meta">{release.year ?? 'Year unknown'} · {release.line ?? 'Line not recorded'}</p><h2>{release.name}</h2><p className="condition">{release.kind}{owned.has(release.id) ? ' · In collection' : release.ownership_status === 'parts_only' ? ' · Parts only' : release.ownership_status === 'unconfirmed' ? ' · Ownership unconfirmed' : ''}</p><button className="outline cardaction" onClick={() => openRelease(release.id)}>View release</button></div></article>)}</section>}
      {catalog.total > 48 && <div className="pagination"><button className="outline" disabled={offset === 0 || catalogLoading} onClick={() => setOffset(n => Math.max(0, n - 48))}>Previous</button><span>{offset + 1}–{Math.min(offset + 48, catalog.total)} of {catalog.total}</span><button className="outline" disabled={offset + 48 >= catalog.total || catalogLoading} onClick={() => setOffset(n => n + 48)}>Next</button></div>}
    </>}
    <footer>Unofficial G.I. Joe collector catalog.</footer>
    <Dialog open={!!detail || detailLoading || !!detailError} onOpenChange={open => {
            if (!open) {
                detailRequest.current++;
                setDetail(null);
                setDetailError('');
                setDetailLoading(false);
            }
        }}><DialogContent className="editor"><DialogTitle>{detail?.release.name ?? 'Release details'}</DialogTitle><DialogDescription>Catalog information, expected parts and reference images for this release.</DialogDescription>{detailLoading && <p role="status">Loading release…</p>}{detailError && <p role="alert">{detailError}</p>}{detail && <>
      <p>{detail.release.year ?? 'Year unknown'} · {detail.release.line ?? 'Line not recorded'} · {detail.release.kind}{detail.release.retired ? ' · Retired' : ''}</p>
      <dl className="release-metadata">{[['Character', 'character'], ['Series', 'series'], ['Sub-series', 'sub_series'], ['Wave', 'wave'], ['Scale', 'scale'], ['Faction', 'faction'], ['Market', 'market'], ['Manufacturer', 'manufacturer'], ['Product code', 'product_code'], ['UPC', 'upc']].map(([label, key]) => detail.release[key] != null && <div key={key}><dt>{label}</dt><dd>{String(detail.release[key])}</dd></div>)}</dl>
      {typeof detail.release.retail_price_cents === 'number' && <p>Original retail price: {new Intl.NumberFormat('en-US', { style: 'currency', currency: String(detail.release.retail_currency ?? 'USD') }).format(detail.release.retail_price_cents / 100)}</p>}
      {!!detail.images.length && <div className="owner-photo-grid">{detail.images.map(image => <ZoomableImage key={image.link_id} src={image.url} title={detail.parts.find(p => p.id === image.part_id)?.name ?? (image.file_card_id ? 'File card' : detail.release.name)}/>)}</div>}
      <h3>Expected parts</h3>{detail.parts.length ? <ul>{detail.parts.map(part => <li key={part.id}>{part.parent_id && <span>{detail.parts.find(p => p.id === part.parent_id)?.name} / </span>}{part.name} · {part.expected_quantity ?? 'Quantity unknown'} per release</li>)}</ul> : <p>No parts list has been entered yet.</p>}
      {detail.fileCards.map(card => <section className="file-card" key={card.id}><h3>File card</h3><p>{card.text || 'Text not entered yet.'}</p></section>)}
      {!!detail.related.length && <section><h3>Related releases</h3>{detail.related.map(r => <button className="outline" key={r.id + r.kind} onClick={() => openRelease(r.id)}>{r.name} · {r.kind}</button>)}</section>}
      {account && <ReleaseCounts id={detail.release.id}/>}
      {account ? <button className="primary" disabled={!!detail.release.retired} onClick={() => startEntry(detail)}><Plus size={18}/> Add a copy to my collection</button> : <a className="primary" href={signIn} target="_top">Sign in to add to your collection</a>}
    </>}</DialogContent></Dialog>
    <Dialog open={!!edit} onOpenChange={open => {
            if (!open && !busy)
                setEdit(null);
        }}><DialogContent className="editor"><DialogTitle>{edit?.id ? 'Edit owned copy' : 'Add an item'}</DialogTitle><DialogDescription>Blank quantities mean unknown. Zero means absent. Every saved record represents one copy.</DialogDescription>{edit && <form onSubmit={e => { e.preventDefault(); void save(); }}>
      {editError && <p className="notice" role="alert">{editError}</p>}
      <fieldset disabled={busy}><div className="formgrid"><label className="wide">Name<input required maxLength={200} value={edit.name} onChange={e => field('name', e.target.value)}/></label>
      <label>Condition<select aria-describedby="condition-help" value={edit.condition} onChange={e => field('condition', e.target.value as EntryDraft['condition'])}>{Object.keys(conditionHelp).map(c => <option key={c}>{c}</option>)}</select><small id="condition-help">{conditionHelp[edit.condition]}</small><ConditionGuide text={conditionHelp[edit.condition]}/></label>
      <label>Completeness<select value={edit.completeness} onChange={e => setEdit(quickChoice(edit, e.target.value as EntryDraft['completeness'], editCatalog?.parts ?? []))}>{['Not sure', 'Partial', 'Complete'].map(c => <option key={c} disabled={c === 'Complete' && (!edit.releaseId || !editCatalog?.parts.length || editCatalog.parts.some(p => p.expected_quantity === null))}>{c}</option>)}</select><small>Complete means original packaging and all expected parts.</small></label>
      <label>Original packaging<select value={edit.packaging} onChange={e => field('packaging', e.target.value as EntryDraft['packaging'])}><option value="unknown">Unknown</option><option value="present">Present</option><option value="absent">Absent</option></select></label>
      <label>Sealed status<select value={edit.sealed === null ? 'unknown' : String(edit.sealed)} onChange={e => field('sealed', e.target.value === 'unknown' ? null : e.target.value === 'true')}><option value="unknown">Unknown</option><option value="true">Sealed</option><option value="false">Opened</option></select></label>
      <label>Ownership<select value={edit.ownership ?? 'auto'} onChange={e => field('ownership', e.target.value === 'auto' ? undefined : e.target.value as EntryDraft['ownership'])}><option value="auto">Based on recorded parts</option><option value="owned">Confirmed owned item</option><option value="parts_only">Parts only</option><option value="unconfirmed">Ownership unconfirmed</option></select></label>
      <label>Storage location (private)<input maxLength={200} value={edit.location ?? ''} onChange={e => field('location', e.target.value || null)}/></label><label>Acquisition date (private)<input type="date" value={edit.acquiredAt ?? ''} onChange={e => field('acquiredAt', e.target.value || null)}/></label><label>Purchase price in cents (private)<input type="number" min={0} max={1000000000} step={1} value={edit.purchasePriceCents ?? ''} onChange={e => field('purchasePriceCents', e.target.value === '' ? null : Number(e.target.value))}/></label><label>Purchase currency (private)<input maxLength={3} pattern="[A-Z]{3}" placeholder="USD" value={edit.purchaseCurrency ?? ''} onChange={e => field('purchaseCurrency', e.target.value.toUpperCase() || null)}/></label><label>Purchase source (private)<input maxLength={500} value={edit.purchaseSource ?? ''} onChange={e => field('purchaseSource', e.target.value || null)}/></label><label className="wide">Private notes<textarea maxLength={6000} value={edit.notes} onChange={e => field('notes', e.target.value)}/></label></div>
      <section className="pieces"><h3>Parts I have</h3>{edit.parts.map((part, index) => <div className="normalized-part" key={part.partId}><label>{labels[part.partId] ?? 'Catalog part'}{editCatalog?.parts.find(p => p.id === part.partId)?.parent_id && <small>Part of {labels[editCatalog.parts.find(p => p.id === part.partId)!.parent_id!] ?? 'parent part'}</small>}<input aria-label={'Quantity of ' + (labels[part.partId] ?? part.partId)} type="number" min="0" max="9999" step="1" placeholder="Unknown" value={part.quantity ?? ''} onChange={e => field('parts', edit.parts.map((p, i) => i === index ? { ...p, quantity: nullableQuantity(e.target.value) } : p))}/></label><PartCondition condition={part.condition} defects={part.defects} onChange={value => field('parts', edit.parts.map((p, i) => i === index ? { ...p, ...value } : p))}/></div>)}
      {edit.unidentifiedParts.map((part, index) => <div className="normalized-part" key={index}><label>{part.name}<input aria-label={'Quantity of ' + part.name} type="number" min="0" max="9999" step="1" placeholder="Unknown" value={part.quantity ?? ''} onChange={e => field('unidentifiedParts', edit.unidentifiedParts.map((p, i) => i === index ? { ...p, quantity: nullableQuantity(e.target.value) } : p))}/></label><button type="button" className="outline" aria-label={'Remove ' + part.name} onClick={() => field('unidentifiedParts', edit.unidentifiedParts.filter((_, i) => i !== index))}>Remove</button><PartCondition condition={part.condition} defects={part.defects} onChange={value => field('unidentifiedParts', edit.unidentifiedParts.map((p, i) => i === index ? { ...p, ...value } : p))}/></div>)}
      <div className="add-piece"><input aria-label="Unidentified part name" maxLength={200} placeholder="Unidentified accessory or part…" value={looseName} onChange={e => setLooseName(e.target.value)}/><button type="button" className="outline" disabled={!looseName.trim()} onClick={() => { field('unidentifiedParts', [...edit.unidentifiedParts, { name: looseName.trim(), quantity: null, condition: null, defects: '' }]); setLooseName(''); }}>Add part</button></div>
      {editCatalog && edit.reviewedRevision !== editCatalog.release.revision && <p className="notice">The parts list needs review. New quantities remain unknown. <button type="button" className="outline" onClick={() => field('reviewedRevision', editCatalog.release.revision)}>Mark this revision reviewed</button></p>}</section>
      </fieldset>
      <CollectionPhoto disabled={busy || (edit.photos?.length ?? 0) >= 10} photos={edit.photos ?? []} onWorkingChange={setBusy} onUpload={async (file) => {
                const form = new FormData();
                form.set('file', await uploadImage(file));
                const result = await requestJSON<{
                    url: string;
                }>('/api/photo', { method: 'POST', body: form });
                setEdit(previous => previous ? { ...previous, photos: [...(previous.photos ?? []), result.url] } : previous);
            }} onRemove={index => field('photos', edit.photos?.filter((_, i) => i !== index))} onCover={index => field('photos', [edit.photos![index], ...edit.photos!.filter((_, i) => i !== index)])}/>
      <div className="formactions">{edit.id && <button type="button" className="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete copy</button>}<button type="button" className="outline" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Save copy'}</button></div>
    </form>}</DialogContent></Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogTitle>Delete this copy?</AlertDialogTitle><AlertDialogDescription>This removes this collection record. Other copies are unchanged.</AlertDialogDescription><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Delete copy</AlertDialogAction></AlertDialogContent></AlertDialog>
  </main>;
}
