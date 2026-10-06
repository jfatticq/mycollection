import entries from './catalog.json';
import metadata from './product-metadata.json';
import aliases from './release-aliases.json';
export function canonicalId(id:string){return (aliases as Record<string,string>)[id]||id;}
const catalog=entries.filter(r=>canonicalId(r.id)===r.id).map(r=>({...r,...((metadata as Record<string,any>)[r.id]||{})}));
export default catalog;
