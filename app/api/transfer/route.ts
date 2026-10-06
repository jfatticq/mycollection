import { actor, mutation, json, failure, AccessError, privateHeaders } from '@/lib/auth/access';
import { db } from '@/lib/db';
import { prepareEntry, entries } from '@/lib/collection/store';
import { prepareRelease, releaseInput } from '@/lib/catalog-store';
import { entryInput } from '@/lib/collection/input';
import { releaseDetail } from '@/lib/catalog-read';
import { releaseDraft, blankRelease } from '@/lib/catalog-editor';
import { draftFromEntry, newDraft, OwnedEntry } from '@/lib/collection/editor';
import { csvEncode, parseTransfer } from '@/lib/transfer-format';
import { bodyJSON, limit } from '@/lib/limits';
export async function GET(request: Request) {
    try {
        const a = await actor(request), p = new URL(request.url).searchParams;
        const kind = p.get('kind') ?? 'collection', format = p.get('format') ?? 'json';
        if (!['catalog', 'collection'].includes(kind) || !['json', 'csv'].includes(format))
            throw new AccessError(400, 'Invalid transfer format.');
        if (kind === 'catalog' && !a.isAdmin)
            throw new AccessError(403, 'Administrator required.');
        let items: any[] = [];
        let mediaMapping: any[] = [];
        if (p.get('template') === 'true')
            items = [kind === 'catalog' ? { ...blankRelease(), name: 'Replace with release name', parts: [{ id: 'replace-with-unique-part-id', name: 'Primary toy', kind: 'primary', parentId: null, expectedQuantity: 1, sortOrder: 0, linkedReleaseId: null }] } : { ...newDraft(), name: 'Replace with item name' }];
        else if (kind === 'collection') {
            const owned = await entries(a.collectionId, true);
            items = owned.map(e => { const { photos, ...draft } = draftFromEntry(e as OwnedEntry); return draft; });
            mediaMapping = owned.map(e => ({ entryId: e.id, photos: e.photos }));
        }
        else {
            const rows = await db().prepare('SELECT id FROM catalog_releases WHERE id NOT IN(SELECT source_id FROM catalog_merges) ORDER BY id').all<{
                id: string;
            }>();
            for (const row of rows.results) {
                const detail = await releaseDetail(row.id);
                items.push(releaseDraft(detail));
                mediaMapping.push({ releaseId: row.id, images: detail.images });
            }
        }
        const contents = format === 'csv' ? csvEncode(items, kind) : JSON.stringify({ version: 1, kind, items, mediaMapping }, null, 2);
        return new Response(contents, { headers: { ...privateHeaders, 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json', 'Content-Disposition': `attachment; filename="gi-jeffs-files-${kind}${p.get('template') === 'true' ? '-template' : ''}.${format}"` } });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        mutation(request);
        const a = await actor(request);
        await limit(a.id, 'transfer', 30, 3600);
        const b = await bodyJSON(request);
        if (b.action === 'commit') {
            const run = await db().prepare('SELECT * FROM import_runs WHERE id=? AND user_id=?').bind(b.previewId, a.id).first<any>();
            if (!run || run.expires_at < Date.now())
                throw new AccessError(400, 'Preview expired. Validate the file again.');
            if (run.committed)
                return json({ ok: true, alreadyCommitted: true });
            if (run.kind === 'catalog' && !a.isAdmin)
                throw new AccessError(403, 'Administrator required.');
            const payload = JSON.parse(run.payload);
            const prepared = [];
            try{for (const item of payload)
                prepared.push(run.kind === 'catalog' ? await prepareRelease(a, item, payload.map((r: any) => r.id)) : await prepareEntry(a, item));}catch(e){const current=await db().prepare('SELECT committed FROM import_runs WHERE id=? AND user_id=?').bind(run.id,a.id).first<{committed:number}>();if(current?.committed)return json({ok:true,alreadyCommitted:true});throw e;}
            // All releases exist before cross-release part/variant links are inserted.
            const statements = run.kind === 'catalog' ? [...prepared.map(p => p.statements[0]), ...prepared.flatMap(p => p.statements.slice(1))] : prepared.flatMap(p => p.statements);
            if (statements.length > 500)
                throw new AccessError(400, 'Split this import into smaller files (maximum 500 database statements).');
            const guardId=crypto.randomUUID();
            statements.unshift(db().prepare('INSERT INTO operation_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM import_runs WHERE id=? AND user_id=? AND committed=0 AND expires_at>=?) THEN 1 ELSE 0 END').bind(guardId,run.id,a.id,Date.now()));
            statements.push(db().prepare('UPDATE import_runs SET committed=1,payload=? WHERE id=? AND user_id=?').bind('[]', run.id, a.id),db().prepare('DELETE FROM operation_guards WHERE id=?').bind(guardId));
            try{await db().batch(statements);}catch(e){if(String(e).includes('operation_must_be_current')){const current=await db().prepare('SELECT committed FROM import_runs WHERE id=? AND user_id=?').bind(run.id,a.id).first<{committed:number}>();if(current?.committed)return json({ok:true,alreadyCommitted:true});throw new AccessError(400,'Preview expired or changed. Validate again.');}throw e;}
            return json({ ok: true, imported: prepared.length });
        }
        if (b.action !== 'preview' || !['catalog', 'collection'].includes(b.kind) || !['json', 'csv'].includes(b.format) || typeof b.text !== 'string')
            throw new AccessError(400, 'Invalid import request.');
        if (b.kind === 'catalog' && !a.isAdmin)
            throw new AccessError(403, 'Administrator required.');
        let rows: any[];
        try {
            rows = parseTransfer(b.text, b.format, b.kind);
        }
        catch (e) {
            throw new AccessError(400, e instanceof Error ? e.message : 'Invalid import file.');
        }
        if (!rows.length || rows.length > 50)
            throw new AccessError(400, 'Import 1–50 rows at a time.');
        if (rows.reduce((total, row) => total + ['parts','fileCards','unidentifiedParts','taxonomyIds','related','photos'].reduce((sum,key)=>sum+(Array.isArray(row[key])?row[key].length:0),0) + 6, 0) > 400)
            throw new AccessError(400, 'Split this import into smaller files; too many nested parts.');
        const errors: {
            row: number;
            message: string;
        }[] = [], normalized: any[] = [], rowNumbers: number[] = [], seen = new Set<string>(), components = new Set<string>();
        for (const [index, row] of rows.entries()) {
            try {
                const parsed = (b.kind === 'catalog' ? releaseInput : entryInput).safeParse(row);
                if (!parsed.success)
                    throw Error(parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '));
                const item = { ...parsed.data, id: parsed.data.id ?? crypto.randomUUID() };
                if (seen.has(item.id))
                    throw Error('Duplicate item ID in this file.');
                seen.add(item.id);
                if (b.kind === 'catalog')
                    for (const part of [...(item as any).parts, ...(item as any).fileCards]) {
                        if (components.has(part.id))
                            throw Error('Component IDs must be unique across the import.');
                        components.add(part.id);
                    }
                normalized.push(item);
                rowNumbers.push(index + 1);
            }
            catch (e) {
                errors.push({ row: index + 1, message: e instanceof Error ? e.message : 'Invalid row.' });
            }
        }
        for (const [index, item] of normalized.entries())
            try {
                if (b.kind === 'catalog')
                    await prepareRelease(a, item, normalized.map(r => r.id));
                else
                    await prepareEntry(a, item);
            }
            catch (e) {
                errors.push({ row: rowNumbers[index], message: e instanceof Error ? e.message : 'Invalid row.' });
            }
        if (errors.length)
            return json({ errors, previewId: null, rows: [] });
        const previewId = crypto.randomUUID();
        await db().batch([db().prepare('DELETE FROM import_runs WHERE expires_at<? OR (user_id=? AND committed=1)').bind(Date.now(), a.id), db().prepare('INSERT INTO import_runs(id,user_id,kind,payload,expires_at) VALUES(?,?,?,?,?)').bind(previewId, a.id, b.kind, JSON.stringify(normalized), Date.now() + 30 * 60 * 1000)]);
        const preview = [];
        for (const item of normalized) {
            const old = await db().prepare(`SELECT id FROM ${b.kind === 'catalog' ? 'catalog_releases' : 'owned_entries'} WHERE id=?`).bind(item.id).first();
            preview.push({ id: item.id, name: item.name, action: old ? 'update' : 'add',item });
        }
        return json({ previewId, errors: [], rows: preview });
    }
    catch (e) {
        return failure(e);
    }
}
