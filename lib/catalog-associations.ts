import {db} from '@/lib/db';
import {AccessError} from '@/lib/auth/access';
export async function catalogAssociations(release:any){
 const characters=(await db().prepare('SELECT name,part_id AS partId FROM release_characters WHERE release_id=? ORDER BY sort_order,id').bind(release.id).all<{name:string;partId:string|null}>()).results;
 const factions=(await db().prepare("SELECT t.id,t.name,t.parent_id FROM taxonomy t JOIN release_taxonomy rt ON rt.taxonomy_id=t.id WHERE rt.release_id=? AND t.kind='faction' ORDER BY t.name,t.id").bind(release.id).all<{id:string;name:string;parent_id:string|null}>()).results;
 return {characters:characters.length?characters:release.character?[{name:String(release.character),partId:null}]:[],factions:factions.length?factions:release.faction?[{id:null,name:String(release.faction),parent_id:null}]:[]};
}
export async function prepareFactions(names:string[]){
 const statements:D1PreparedStatement[]=[],ids:string[]=[];
 for(const name of names){
  const existing=await db().prepare("SELECT id FROM taxonomy WHERE kind='faction' AND name=? COLLATE NOCASE ORDER BY id LIMIT 1").bind(name).first<{id:string}>();let id=existing?.id;
  if(!id){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name.normalize('NFC').toLowerCase()));id='faction_'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
   const collision=await db().prepare('SELECT kind,name FROM taxonomy WHERE id=?').bind(id).first<any>();if(collision&&(collision.kind!=='faction'||collision.name.toLowerCase()!==name.toLowerCase()))throw new AccessError(409,'Faction identifier conflict. Rename the term.');
   statements.push(db().prepare("INSERT INTO taxonomy(id,kind,name,parent_id) VALUES(?,'faction',?,NULL) ON CONFLICT(id) DO NOTHING").bind(id,name));
  }ids.push(id);
 }return {ids,statements};
}
export function factionFilterSQL(){return `EXISTS(WITH RECURSIVE chosen(id,name) AS (SELECT id,name FROM taxonomy WHERE kind='faction' AND (id=? OR name=? COLLATE NOCASE) UNION SELECT t.id,t.name FROM taxonomy t JOIN chosen c ON t.parent_id=c.id WHERE t.kind='faction') SELECT 1 FROM chosen c WHERE EXISTS(SELECT 1 FROM release_taxonomy rt WHERE rt.release_id=r.id AND rt.taxonomy_id=c.id) OR (r.faction=c.name COLLATE NOCASE AND NOT EXISTS(SELECT 1 FROM release_taxonomy rt JOIN taxonomy t ON t.id=rt.taxonomy_id WHERE rt.release_id=r.id AND t.kind='faction')))`;}
export function taxonomyFilterSQL(){return `EXISTS(WITH RECURSIVE chosen(id,kind) AS (SELECT id,kind FROM taxonomy WHERE id=? UNION SELECT t.id,t.kind FROM taxonomy t JOIN chosen c ON t.parent_id=c.id WHERE c.kind='faction' AND t.kind='faction') SELECT 1 FROM release_taxonomy rt JOIN chosen c ON c.id=rt.taxonomy_id WHERE rt.release_id=r.id)`;}
export function inheritedFactions(names:string[],terms:any[]){
 const ids=new Set<string>(),allNames=new Set(names);
 for(const name of names){let term=terms.find(t=>t.kind==='faction'&&t.name.toLowerCase()===name.toLowerCase());const seen=new Set<string>();while(term&&!seen.has(term.id)&&term.kind==='faction'){seen.add(term.id);ids.add(term.id);allNames.add(term.name);term=terms.find(t=>t.id===term.parent_id);}}
 return {ids:[...ids],names:[...allNames]};
}
