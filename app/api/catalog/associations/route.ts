import {db} from '@/lib/db';
import {json,failure} from '@/lib/auth/access';
export async function GET(){try{return json({characters:(await db().prepare('SELECT DISTINCT name FROM release_characters UNION SELECT character AS name FROM catalog_releases WHERE character IS NOT NULL AND id NOT IN(SELECT release_id FROM release_characters) ORDER BY name LIMIT 500').all<{name:string}>()).results.map(c=>c.name)});}catch(e){return failure(e);}}
