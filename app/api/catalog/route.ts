import {catalogTileAttributes} from '@/lib/catalog-tile-attributes';
import { db } from '@/lib/db';
import { actor, administrator, mutation, json, failure, AccessError } from '@/lib/auth/access';
import { saveRelease } from '@/lib/catalog-store';
import { releaseDetail } from '@/lib/catalog-read';
import { limit,bodyJSON } from '@/lib/limits';
import {factionFilterSQL} from '@/lib/catalog-associations';
export async function GET(request: Request) {
    try {
        const p = new URL(request.url).searchParams, id = p.get('id');
        if (id) {
            return json(await releaseDetail(id));
        }
        const limit = Number(p.get('limit') ?? 50), offset = Number(p.get('offset') ?? 0);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0)
            throw new AccessError(400, 'Invalid pagination.');
        const q = (p.get('q') ?? '').slice(0, 200);
        const includeRetired=p.get('includeRetired')==='true';if(includeRetired)await administrator(request);
        const where = [includeRetired?'1=1':'r.retired=0', '(r.name LIKE ? OR r.character LIKE ? OR r.product_code LIKE ? OR r.upc LIKE ?)'];
        const parameters: (string | number)[] = Array(4).fill('%'+q+'%');
        for(const column of ['kind','series','sub_series','wave','scale','market','manufacturer'])if(p.get(column)){where.push(`r.${column}=?`);parameters.push(p.get(column)!);}
        if(p.get('character')){where.push('(EXISTS(SELECT 1 FROM release_characters c WHERE c.release_id=r.id AND c.name=? COLLATE NOCASE) OR r.character=? COLLATE NOCASE)');parameters.push(p.get('character')!,p.get('character')!);}
        if(p.get('faction')){where.push(`(${factionFilterSQL()} OR (r.faction=? COLLATE NOCASE AND NOT EXISTS(SELECT 1 FROM release_taxonomy rt JOIN taxonomy t ON t.id=rt.taxonomy_id WHERE rt.release_id=r.id AND t.kind='faction')))`);parameters.push(p.get('faction')!,p.get('faction')!,p.get('faction')!);}
        if(p.get('taxonomyId')){const term=await db().prepare('SELECT kind FROM taxonomy WHERE id=?').bind(p.get('taxonomyId')!).first<{kind:string}>();if(term?.kind==='faction'){where.push(factionFilterSQL());parameters.push(p.get('taxonomyId')!,p.get('taxonomyId')!);}else{where.push('EXISTS(SELECT 1 FROM release_taxonomy rt WHERE rt.release_id=r.id AND rt.taxonomy_id=?)');parameters.push(p.get('taxonomyId')!);}}
        const sort={name:'r.name,r.year,r.id',year:'r.year,r.name,r.id',newest:'r.year DESC,r.name,r.id'}[p.get('sort')??'year']??'r.year,r.name,r.id';
        if (p.get('line')) {
            where.push('r.line=?');
            parameters.push(p.get('line')!);
        }
        if (p.get('year')) {
            const year = Number(p.get('year'));
            if (!Number.isInteger(year))
                throw new AccessError(400, 'Invalid year.');
            where.push('r.year=?');
            parameters.push(year);
        }
        let collectionId: string | null = null;
        if (p.get('ownership') === 'unowned') {
            collectionId = (await actor(request)).collectionId;
            where.push("NOT EXISTS(SELECT 1 FROM owned_entries e WHERE e.release_id=r.id AND e.collection_id=? AND e.ownership='owned')");
            parameters.push(collectionId);
        }
        const filters = where.join(' AND ');
        const marker = collectionId ? ",CASE WHEN EXISTS(SELECT 1 FROM owned_entries e WHERE e.release_id=r.id AND e.collection_id=? AND e.ownership='parts_only') THEN 'parts_only' WHEN EXISTS(SELECT 1 FROM owned_entries e WHERE e.release_id=r.id AND e.collection_id=? AND e.ownership='unconfirmed') THEN 'unconfirmed' ELSE 'none' END AS ownership_status" : '';
        const [rows, total, lines, years] = await Promise.all([
            db().prepare(`SELECT r.*,(SELECT m.id FROM media_links l JOIN media m ON m.id=l.media_id WHERE l.release_id=r.id AND m.scope='catalog' ORDER BY l."primary" DESC,l.sort_order,l.id LIMIT 1) AS image_id ${marker} FROM catalog_releases r WHERE ${filters} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...(collectionId ? [collectionId, collectionId] : []), ...parameters, limit, offset).all(),
            db().prepare(`SELECT COUNT(*) AS count FROM catalog_releases r WHERE ${filters}`).bind(...parameters).first<{
                count: number;
            }>(),
            db().prepare('SELECT DISTINCT line FROM catalog_releases WHERE retired=0 AND line IS NOT NULL ORDER BY line').all<{
                line: string;
            }>(),
            db().prepare('SELECT DISTINCT year FROM catalog_releases WHERE retired=0 AND year IS NOT NULL ORDER BY year').all<{
                year: number;
            }>(),
        ]);
        const page=rows.results as any[],ids=page.map(row=>row.id),slots=ids.map(()=>'?').join(',');
        const [parts,factions,cards]=ids.length?await Promise.all([
            db().prepare('SELECT release_id,kind,part_type,expected_quantity FROM catalog_parts WHERE retired=0 AND release_id IN('+slots+')').bind(...ids).all<any>(),
            db().prepare("SELECT rt.release_id,t.name FROM release_taxonomy rt JOIN taxonomy t ON t.id=rt.taxonomy_id WHERE t.kind='faction' AND rt.release_id IN("+slots+") ORDER BY t.name").bind(...ids).all<any>(),
            db().prepare('SELECT DISTINCT release_id FROM file_cards WHERE release_id IN('+slots+')').bind(...ids).all<any>(),
        ]):[{results:[]},{results:[]},{results:[]}];
        const releases=page.map(row=>({...row,tileAttributes:catalogTileAttributes(row,parts.results.filter(part=>part.release_id===row.id),factions.results.filter(faction=>faction.release_id===row.id).map(faction=>faction.name),cards.results.some(card=>card.release_id===row.id))}));
        return json({ releases, total: total?.count ?? 0, limit, offset, lines: lines.results.map(r => r.line), years: years.results.map(r => r.year) });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        mutation(request);
        const a = await administrator(request);
        await limit(a.id,'catalog-write',60,60);
        const body = await bodyJSON(request) as {
            release?: unknown;
        };
        return json(await saveRelease(a, body.release));
    }
    catch (e) {
        return failure(e);
    }
}
