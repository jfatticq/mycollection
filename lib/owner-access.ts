import { administrator, failure } from './auth/access';
// Existing catalog audit routes use the explicit server-side administrator role.
export async function ownerWriteError(request: Request) {
    try {
        await administrator(request);
        return null;
    }
    catch (e) {
        return failure(e);
    }
}
