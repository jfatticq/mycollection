// Identity headers are supplied by Sites dispatch after authentication.
const ownerEmail='jfattic@live.com';
export function isCollectionOwner(headers:Headers){return !!headers.get('oai-authenticated-user-id')&&headers.get('oai-authenticated-user-email')?.trim().toLowerCase()===ownerEmail;}
export function ownerWriteError(request:Request){return isCollectionOwner(request.headers)?null:Response.json({error:'Only the collection owner can change items. Sign in with the owner account.'},{status:403});}
