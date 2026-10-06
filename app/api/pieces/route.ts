import { releaseDetail } from '@/lib/catalog-read';
import { json, failure, AccessError } from '@/lib/auth/access';
export async function GET(request: Request) { try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id)
        throw new AccessError(400, 'Release ID required.');
    const d = await releaseDetail(id);
    return json({ pieces: d.parts });
}
catch (e) {
    return failure(e);
} }
