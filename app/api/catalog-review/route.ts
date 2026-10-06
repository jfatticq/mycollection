import { administrator, json, failure } from '@/lib/auth/access';
async function retired(request: Request) { try {
    await administrator(request);
    return json({ error: 'Legacy catalog research tools have been retired.' }, 410);
}
catch (e) {
    return failure(e);
} }
export const GET = retired;
export const POST = retired;
