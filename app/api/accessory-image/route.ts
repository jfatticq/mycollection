import { db } from '@/lib/db';
import { failure, AccessError, privateHeaders } from '@/lib/auth/access';
export async function GET(request: Request) { try {
    const p = new URL(request.url).searchParams;
    const image = await db().prepare("SELECT m.id FROM media m JOIN media_links l ON l.media_id=m.id JOIN catalog_parts k ON k.id=l.part_id WHERE m.id=? AND k.release_id=? AND k.retired=0 AND m.scope='catalog'").bind(p.get('photo'), p.get('id')).first<{
        id: string;
    }>();
    if (!image)
        throw new AccessError(404, 'Part photo not found.');
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: '/api/photo?id=' + image.id } });
}
catch (e) {
    return failure(e);
} }
