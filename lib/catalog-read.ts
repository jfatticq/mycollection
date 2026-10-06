import { db } from '@/lib/db';
import { AccessError } from '@/lib/auth/access';
export async function releaseDetail(id: string):Promise<{release:Record<string,any>;parts:Record<string,any>[];fileCards:Record<string,any>[];images:{id:string;link_id:string;url:string;release_id:string|null;part_id:string|null;file_card_id:string|null;sort_order:number;primary:number}[];related:Record<string,any>[];taxonomy:Record<string,any>[];redirectedFrom?:string}> {
    const merge=await db().prepare('SELECT target_id FROM catalog_merges WHERE source_id=?').bind(id).first<{target_id:string}>();
    if(merge){const result=await releaseDetail(merge.target_id);return {...result,redirectedFrom:id};}
    const release = await db().prepare('SELECT * FROM catalog_releases WHERE id=?').bind(id).first();
    if (!release)
        throw new AccessError(404, 'Release not found.');
    const [parts, fileCards, images, related] = await Promise.all([
        db().prepare('SELECT * FROM catalog_parts WHERE release_id=? AND retired=0 ORDER BY sort_order,id').bind(id).all(),
        db().prepare('SELECT id,text FROM file_cards WHERE release_id=?').bind(id).all(),
        db().prepare(`SELECT m.id,l.id AS link_id,l.release_id,l.part_id,l.file_card_id,l.sort_order,l."primary" FROM media_links l JOIN media m ON m.id=l.media_id WHERE m.scope='catalog' AND (l.release_id=? OR l.part_id IN(SELECT id FROM catalog_parts WHERE release_id=? AND retired=0) OR l.file_card_id IN(SELECT id FROM file_cards WHERE release_id=?)) ORDER BY l."primary" DESC,l.sort_order,l.id`).bind(id, id, id).all<{
            id: string;
            link_id: string;
            release_id: string | null;
            part_id: string | null;
            file_card_id: string | null;
            sort_order: number;
            primary: number;
        }>(),
        db().prepare('SELECT l.kind,r.id,r.name,r.year,r.line FROM release_links l JOIN catalog_releases r ON r.id=CASE WHEN l.release_id=? THEN l.related_id ELSE l.release_id END WHERE l.release_id=? OR l.related_id=?').bind(id, id, id).all(),
    ]);
    const taxonomy=await db().prepare('SELECT t.* FROM release_taxonomy rt JOIN taxonomy t ON t.id=rt.taxonomy_id WHERE rt.release_id=?').bind(id).all();
    return { release, parts: parts.results, fileCards: fileCards.results, images: images.results.map(m => ({ ...m, url: '/api/photo?id=' + m.id })), related: related.results,taxonomy:taxonomy.results };
}
