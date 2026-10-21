'use client';
import { useEffect, useState, useId } from 'react';
import { LaunchShell, useLaunchAccount, AccessNotice } from '@/components/launch-shell';
import { requestJSON } from '@/lib/api-client';
import { releaseDraft, blankRelease, ReleaseDraft } from '@/lib/catalog-editor';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/zoomable-image';
import { CatalogHistory } from '@/components/catalog-history';
import { DeletionMaintenance } from '@/components/deletion-maintenance';
import { Search, ArrowLeft, ArrowRight, Plus, ArrowUpDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {RequiredMark} from '@/components/required-mark';
import {FieldGuidance} from '@/components/field-guidance';
import {uploadCatalogPartPhoto} from '@/lib/media/catalog-upload';
import { uploadImage } from '@/lib/media/browser-image';
import {CatalogChoice,CatalogYear,scaleChoices,currencyChoices,marketChoices,catalogMetadataChoices,metadataChoices,CatalogMetadataField} from '@/components/catalog-choice';
import {RemoveIconButton} from '@/components/remove-icon-button';
import {CatalogItemTile} from '@/components/catalog-item-tile';
import {CatalogPrice} from '@/components/catalog-price';
import {CatalogFactionsEditor} from '@/components/catalog-associations-editor';
import {CatalogContentsEditor} from '@/components/catalog-contents-editor';
import {CatalogClassification} from '@/components/catalog-classification';
import {CatalogTaxonomyPicker} from '@/components/catalog-taxonomy-picker';
import {revealInvalidCatalogField} from '@/lib/catalog-form-validation';
import {contentsChanged} from '@/lib/catalog-classification';
import {CatalogItemPicker} from '@/components/catalog-item-picker';
const catalogFieldLabels = {character:'Character',line:'Line',series:'Series',subSeries:'Sub-Series',wave:'Wave',scale:'Scale',faction:'Faction',market:'Market',manufacturer:'Manufacturer',productCode:'Manufacturer Product Code / SKU',upc:'UPC'};
function optionLabel(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
const catalogIdentifierGuidance = {productCode: "Use the manufacturer's item code or SKU, such as Hasbro Pulse's G20455L00. Retailer SKUs (Target, Walmart, etc.) and your own inventory IDs can differ; do not enter them here. Leave blank when unknown.", upc: 'Copy the UPC barcode number from the packaging or a verified listing, preserving leading zeros. This is separate from the manufacturer SKU and the Classified release number. Leave blank when unknown.'};
const ReleasePicker=CatalogItemPicker;
export default function Admin() {
    const [section, setSection] = useState('items'), [editorTab,setEditorTab]=useState('details');
    const identifierId = useId();
    const [savedPartIds,setSavedPartIds]=useState<string[]>([]);
    const { account, error } = useLaunchAccount(), [rows, setRows] = useState<any[]>([]), [terms, setTerms] = useState<any[]>([]), [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [total, setTotal] = useState(0), [refresh, setRefresh] = useState(0), [edit, setEdit] = useState<ReleaseDraft | null>(null), [images, setImages] = useState<any[]>([]), [subject, setSubject] = useState('release'), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [term, setTerm] = useState<any>({ name: '', kind: 'line', parentId: null }), [merge, setMerge] = useState<any>(null), [sourceId, setSource] = useState(''), [targetId, setTarget] = useState(''), [mapping, setMapping] = useState<Record<string, string>>({});
    useEffect(() => { if (account?.role !== 'admin')
        return; const c = new AbortController(); requestJSON<any>('/api/catalog?includeRetired=true&limit=48&offset=' + offset + '&q=' + encodeURIComponent(query), { signal: c.signal }).then(r => { setRows(r.releases); setTotal(r.total); }).catch(e => { if (!c.signal.aborted)
        setStatus(e.message); }); requestJSON<any>('/api/taxonomy').then(r => setTerms(r.terms)).catch(e => setStatus(e.message)); return () => c.abort(); }, [account, query, offset, refresh]);
    async function open(id: string) { setBusy(true); setStatus(''); try {
        const d = await requestJSON<any>('/api/catalog?id=' + encodeURIComponent(id));
        setEditorTab('details'); setEdit(releaseDraft(d));
        setImages(d.images);
        setSavedPartIds(d.parts.map((p:any)=>p.id));
        setSubject('release');
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    function field(key: keyof ReleaseDraft, value: any) { setEdit(p => p ? { ...p, [key]: value, ...(key==='parts'?{...(contentsChanged(p.parts,value)?{contentsComplete:false}:{}),characters:p.characters.map(c=>({...c,partId:c.partId&&(!p.parts.some(part=>part.id===c.partId)||value.some((part:any)=>part.id===c.partId))?c.partId:null}))}:{}) } : null); }
    async function save(closeAfterSave = false) { if (!edit || busy)
        return; setBusy(true); setStatus(''); try {
        const result = await requestJSON<any>('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: edit }) });
        setEdit(closeAfterSave ? null : { ...edit, id: result.id, expectedRevision: result.revision });
        setSavedPartIds(edit.parts.map(p=>p.id));
        setRefresh(n => n + 1);
        setStatus('Published catalog changes saved.');
    }
    catch (e: any) {
        setStatus(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function partPhoto(partId:string,file:File){
        if(!edit?.id||!savedPartIds.includes(partId))throw new Error('Save the catalog item and this part before adding photos.');
        setBusy(true);setStatus('');try{const detail=await uploadCatalogPartPhoto(edit.id,partId,file,images.length);setImages(detail.images);setStatus('Part photo saved and added to the item gallery.');}finally{setBusy(false);}
    }
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
    return <LaunchShell title="Catalog administration">{!account ? <AccessNotice error={error}/> : account.role !== 'admin' ? <p role="alert">Only the catalog administrator can edit reference records.</p> : <><Tabs className="admin-tabs" value={section} onValueChange={setSection}><TabsList aria-label="Catalog administration sections" variant="line"><TabsTrigger value="items">Catalog items</TabsTrigger><TabsTrigger value="taxonomy">Taxonomy</TabsTrigger><TabsTrigger value="merge">Merge duplicates</TabsTrigger><TabsTrigger value="maintenance">Maintenance</TabsTrigger></TabsList><p role="status" className="admin-status">{status}</p><TabsContent value="items" forceMount><p className="admin-guidance">Saved catalog items publish immediately. Archive unavailable or duplicate records rather than deleting collector history.</p><div className="admin-catalog-actions"><button className="primary" disabled={busy} onClick={() => { setEditorTab('details'); setEdit(blankRelease()); setSavedPartIds([]); setImages([]); setSubject('release'); setStatus(''); }}><Plus size={18} aria-hidden="true"/>New catalog item</button><a className="outline" href="/transfer"><ArrowUpDown size={18} aria-hidden="true"/>Import / export</a><label className="search admin-search"><Search size={20} aria-hidden="true"/><input aria-label="Search catalog" placeholder="Search catalog items…" value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }}/></label></div><section className="collection-grid">{rows.map(r => <CatalogItemTile key={r.id} release={r} disabled={busy} onOpen={()=>void open(r.id)} actionLabel="Edit catalog item"/>)}</section><nav className="pagination" aria-label="Catalog pages">{offset > 0 && <button className="outline icon-button" aria-label="Previous page" title="Previous page" disabled={busy} onClick={() => setOffset(n => Math.max(0, n - 48))}><ArrowLeft size={20} aria-hidden="true"/></button>}<span>{total} catalog items</span>{offset + 48 < total && <button className="outline icon-button" aria-label="Next page" title="Next page" disabled={busy} onClick={() => setOffset(n => n + 48)}><ArrowRight size={20} aria-hidden="true"/></button>}</nav></TabsContent><TabsContent value="maintenance" forceMount><DeletionMaintenance/></TabsContent><TabsContent value="taxonomy" forceMount><section className="launch-panel"><h2>Taxonomy</h2><p>Faction parents define inherited filters. Assign Dreadnoks to Cobra here once; items tagged Dreadnoks will then appear in Cobra searches. A faction cannot be its own ancestor.</p><label>Edit existing term<select value={term.id ?? ''} onChange={e => { const t = terms.find(t => t.id === e.target.value); setTerm(t ? { id: t.id, name: t.name, kind: t.kind, parentId: t.parent_id } : { name: '', kind: 'line', parentId: null }); }}><option value="">New term</option>{terms.map(t => <option key={t.id} value={t.id}>{t.kind}: {t.name}</option>)}</select></label><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try {
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
        } }}><div className="formgrid"><label><span className="field-label-text">Name<RequiredMark/></span><input required value={term.name} maxLength={200} onChange={e => setTerm({ ...term, name: e.target.value })}/></label><label>Type<select value={term.kind} onChange={e => setTerm({ ...term, kind: e.target.value })}>{['line', 'series', 'sub_series', 'wave', 'faction', 'market', 'manufacturer', 'other'].map(k => <option key={k} value={k}>{optionLabel(k)}</option>)}</select></label><label>Parent Faction / Term<select value={term.parentId ?? ''} onChange={e => setTerm({ ...term, parentId: e.target.value || null })}><option value="">None</option>{terms.filter(t => t.id !== term.id && (term.kind!=='faction'||t.kind==='faction')).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><button className="primary" disabled={busy}>Save term</button></form></section></TabsContent><TabsContent value="merge" forceMount><section className="launch-panel"><h2>Merge duplicate catalog items</h2><p>Preview the affected copy count. Private collection details remain private. Every source part requires a unique matching target or an explicit Preserve decision.</p><div className="formgrid"><ReleasePicker label="Duplicate to retire" value={sourceId} onChange={id => { setSource(id); setMerge(null); }}/><ReleasePicker label="Surviving catalog item" value={targetId} onChange={id => { setTarget(id); setMerge(null); }}/></div><button className="outline" disabled={busy || !sourceId || !targetId} onClick={() => mergeAction()}>Preview merge</button>{merge && <><p>{merge.impactedCopies} copies will move from {merge.source.name} to {merge.target.name}. Notes, photos and separate copies stay intact. Complete copies become Partial pending review.</p>{merge.parts.map((p: any) => <label key={p.id}>{p.name}<select value={mapping[p.id] ?? ''} onChange={e => setMapping({ ...mapping, [p.id]: e.target.value })}><option value="">Choose a mapping</option><option value="preserve">Preserve as a retired historical part</option>{merge.targetParts.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}<button className="danger" disabled={busy || merge.parts.some((p: any) => !mapping[p.id])} onClick={() => mergeAction(true)}>Confirm merge of these catalog items</button></>}</section></TabsContent></Tabs>
 </>}
 <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy)
        setEdit(null); }}><DialogContent className="editor"><DialogTitle>{edit?.id ? 'Edit catalog item' : 'New catalog item'}</DialogTitle><DialogDescription>Save publishes changes immediately. Fields marked * are required; other fields may be left unknown.</DialogDescription>{edit && <><Tabs className="catalog-editor-tabs" value={editorTab} onValueChange={setEditorTab}><div className="editor-pinned-header"><label className="editor-name">Name<input disabled={busy} required form="catalog-edit-form" maxLength={200} value={edit.name} onChange={e=>field('name',e.target.value)}/></label><CatalogClassification parts={edit.parts} kind={edit.kind} mode={edit.classificationMode} complete={edit.contentsComplete} onChange={(mode,kind)=>setEdit(previous=>previous?{...previous,classificationMode:mode,kind}:null)}/><TabsList aria-label="Catalog item sections" variant="line"><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="contents">Contents ({edit.parts.length})</TabsTrigger><TabsTrigger value="media">Photos &amp; File Cards</TabsTrigger><TabsTrigger value="related">Related &amp; History</TabsTrigger></TabsList></div><form id="catalog-edit-form" noValidate onSubmit={e=>{e.preventDefault(); if(revealInvalidCatalogField(e.currentTarget,setEditorTab))return; void save((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='save-close');}}><fieldset disabled={busy}><TabsContent value="details" forceMount hidden={editorTab!=='details'} data-editor-panel="details"><div className="formgrid"><CatalogYear value={edit.year??null} onChange={value=>field('year',value)}/>{(Object.keys(catalogMetadataChoices) as CatalogMetadataField[]).map(key=><CatalogChoice key={key} label={catalogMetadataChoices[key].label} value={edit[key]??null} choices={metadataChoices(key,terms)} onChange={value=>field(key,value)} guidance={catalogMetadataChoices[key].guidance} customPlaceholder={'Enter '+catalogMetadataChoices[key].label.toLowerCase()} customHelp="Custom values are saved with this catalog item. Manage reusable suggestions in the Taxonomy tab."/>)}{(['productCode', 'upc'] as const).map(k => <div className="catalog-choice" key={k}><div className="catalog-choice-heading"><label htmlFor={identifierId+'-'+k}>{catalogFieldLabels[k]}</label><FieldGuidance label={catalogFieldLabels[k]} text={catalogIdentifierGuidance[k]}/></div><input id={identifierId+'-'+k} maxLength={200} value={edit[k] ?? ''} onChange={e => field(k, e.target.value || null)}/></div>)}<CatalogChoice label="Market" value={edit.market??null} choices={marketChoices} onChange={value=>field('market',value)} guidance="Country or sales region where this catalog item was released, not where you purchased it. Choose a country or region, select Other… for a custom value, or leave Unknown when unsure. Use consistent names for filtering." customPlaceholder="Enter a country or sales region" customHelp="Enter the market name to save with this catalog item."/><CatalogChoice label="Scale" value={edit.scale??null} choices={scaleChoices} onChange={value=>field('scale',value)}/><div className="formgrid wide"><CatalogChoice label="Retail Currency" value={edit.retailCurrency??null} choices={currencyChoices} currency onChange={value=>field('retailCurrency',value)}/><CatalogPrice value={edit.retailPriceCents??null} onChange={value=>field('retailPriceCents',value)}/></div><label><input type="checkbox" checked={edit.retired} onChange={e => field('retired', e.target.checked)}/> Archived</label></div><CatalogFactionsEditor factions={edit.factions} terms={terms} onFactions={value=>field('factions',value)}/><CatalogTaxonomyPicker terms={terms} selected={edit.taxonomyIds} onChange={value=>field('taxonomyIds',value)}/></TabsContent><TabsContent value="contents" forceMount hidden={editorTab!=='contents'} data-editor-panel="contents">
 <CatalogContentsEditor parts={edit.parts} characters={edit.characters} contentsComplete={edit.contentsComplete} onContentsComplete={value=>field('contentsComplete',value)} releaseKind={edit.kind} releaseId={edit.id} images={images} savedPartIds={savedPartIds} busy={busy} onPartPhoto={partPhoto} onParts={value=>field('parts',value)} onCharacters={value=>field('characters',value)}/>
 </TabsContent><TabsContent value="media" forceMount hidden={editorTab!=='media'} data-editor-panel="media"><h3>File Cards</h3>{edit.fileCards.map((c, i) => <section className="removable-card file-card-editor" key={c.id}><div className="removable-card-heading"><h4>File Card {i+1}</h4><RemoveIconButton label={'Remove file card '+(i+1)} onClick={()=>field('fileCards',edit.fileCards.filter((_,j)=>j!==i))}/></div><label>File Card Text<textarea maxLength={30000} rows={5} value={c.text} onChange={e => field('fileCards', edit.fileCards.map((v, j) => j === i ? { ...v, text: e.target.value } : v))}/></label></section>)}<button className="outline" type="button" onClick={() => field('fileCards', [...edit.fileCards, { id: crypto.randomUUID(), text: '' }])}>Add file card</button>
 <h3>Reference Photos</h3><p>Photo uploads, removals, and cover changes save immediately. Close w/o Saving discards unsaved catalog fields.</p>{!edit.id ? <p>Save the catalog item before adding photos.</p> : <><label>Photo Subject<select value={subject} onChange={e => setSubject(e.target.value)}><option value="release">Catalog Item</option>{edit.parts.map(p => <option key={p.id} value={'part:' + p.id}>Part: {p.name}</option>)}{edit.fileCards.map((c, i) => <option key={c.id} value={'card:' + c.id}>File card {i + 1}</option>)}</select></label><input aria-label="Upload catalog photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !edit.id)
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
        } }}/><p>Save new parts and file cards before selecting them as photo subjects.</p><div className="owner-photo-grid">{images.map(image => <div className="removable-card catalog-photo-card" key={image.link_id}><ZoomableImage src={image.url} title="Catalog photo"/><div className="removable-card-heading"><p>{image.part_id ? edit.parts.find(p => p.id === image.part_id)?.name : image.file_card_id ? 'File card' : 'Catalog item'}</p><RemoveIconButton label={'Remove reference photo for '+(image.part_id?edit.parts.find(p=>p.id===image.part_id)?.name??'part':image.file_card_id?'file card':'catalog item')} disabled={busy} onClick={async () => { setBusy(true); try {
            await requestJSON('/api/media/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlink', mediaId: image.id,linkId:image.link_id }) });
            setImages(images.filter(v => v.link_id !== image.link_id));
        }
        catch (e: any) {
            setStatus(e.message);
        }
        finally {
            setBusy(false);
        } }}/></div>{image.release_id&&<button type="button" className="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await requestJSON("/api/media/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cover",mediaId:image.id,releaseId:edit.id})});setStatus("Catalog cover updated.");}catch(e:any){setStatus(e.message);}finally{setBusy(false);}}}>Make catalog cover</button>}</div>)}</div></>}
 </TabsContent><TabsContent value="related" forceMount hidden={editorTab!=='related'} data-editor-panel="related"><h3>Related Releases</h3><p>Connect variants, repaints and other retail releases. These relationships do not describe included contents or create owned copies.</p>{edit.related.map((r, i) => <section className="removable-card" key={i}><div className="removable-card-heading"><h4>Related Release {i+1}</h4><RemoveIconButton label={'Remove relationship '+(i+1)} onClick={() => field('related', edit.related.filter((_, j) => j !== i))}/></div><div className="formgrid"><ReleasePicker label="Related Release" required excludeId={edit.id} value={r.id} onChange={id => field('related', edit.related.map((v, j) => j === i ? { ...v, id } : v))}/><label><span className="field-label-text">Relationship<RequiredMark/></span><select required value={r.kind} onChange={e => field('related', edit.related.map((v, j) => j === i ? { ...v, kind: e.target.value } : v))}>{['variant', 'repaint', 'international', 'packaging', 'related'].map(k => <option key={k} value={k}>{optionLabel(k)}</option>)}</select></label></div></section>)}<button type="button" className="outline" onClick={() => field('related', [...edit.related, { id: '', kind: 'variant' }])}>Add Related Release</button>
 {edit.id&&<CatalogHistory id={edit.id}/>}</TabsContent></fieldset></form><p role="status" className="editor-status">{status}</p><div className="catalog-save-actions"><button type="submit" form="catalog-edit-form" className="primary" value="save" disabled={busy}>Save</button><button type="submit" form="catalog-edit-form" className="outline catalog-save-close" value="save-close" disabled={busy}>Save &amp; Close</button><button type="button" className="outline catalog-close" disabled={busy} onClick={() => setEdit(null)}>Close w/o Saving</button></div>
 </Tabs></>}</DialogContent></Dialog>
 </LaunchShell>;
}
