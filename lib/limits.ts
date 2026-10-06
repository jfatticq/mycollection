import { db } from '@/lib/db';
import { AccessError } from '@/lib/auth/access';
export async function limit(userId: string, operation: string, maximum: number, seconds = 3600) {
    const window = Math.floor(Date.now() / (seconds * 1000));
    const row = await db().prepare('INSERT INTO rate_limits(key,window,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.window=excluded.window THEN rate_limits.attempts+1 ELSE 1 END,window=excluded.window RETURNING attempts').bind(userId + ':' + operation, window).first<{
        attempts: number;
    }>();
    if (!row || row.attempts > maximum)
        throw new AccessError(429, 'Too many requests. Please try again after this limit window.');
}
export async function bodyJSON(request: Request) {
    const value=JSON.parse(new TextDecoder().decode(await boundedBytes(request, 2 * 1024 * 1024)));
    if(!value||typeof value!=='object'||Array.isArray(value))throw new AccessError(400,'Request body must be an object.');return value;
}
export async function boundedBytes(request: Request, maximum: number) {
    if (!request.body)
        throw new AccessError(400, 'Request body required.');
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            length += value.length;
            if (length > maximum) {
                await reader.cancel();
                throw new AccessError(413, 'Request exceeds the upload limit.');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}
