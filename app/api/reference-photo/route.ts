import { releaseDetail } from '@/lib/catalog-read';
import { failure, AccessError, privateHeaders } from '@/lib/auth/access';
export async function GET(request: Request) { try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id)
        throw new AccessError(400, 'Release ID required.');
    const d = await releaseDetail(id);
    const image = d.images.find(i => i.release_id === id);
    if (!image)
        throw new AccessError(404, 'Reference photo not entered.');
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: image.url } });
}
catch (e) {
    return failure(e);
} }
