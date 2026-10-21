import {physicalPartType} from '@/lib/catalog-parts';
import {classifyContents} from '@/lib/catalog-classification';
export type TileAttributes={factions:string[];contents:{type:'figure'|'companion'|'vehicle'|'equipment'|'playset';quantity:number|null}[];hasParts:boolean;hasFileCard:boolean;classification?:{label:string;provisional:boolean}};
export function catalogTileAttributes(release:{kind:string;faction?:string|null;classification_mode?:string;contents_complete?:number|boolean},parts:{kind:string;part_type?:string|null;expected_quantity:number|null}[],factions:string[],hasFileCard:boolean):TileAttributes{
 const contents:TileAttributes['contents']=[];
 for(const type of ['figure','companion','vehicle','equipment','playset'] as const){const matching=parts.filter(p=>(p.part_type??physicalPartType(p.kind,release.kind))===type);if(!matching.length)continue;const quantity=matching.some(p=>p.expected_quantity===null)?null:matching.reduce((sum,p)=>sum+p.expected_quantity!,0);if(quantity!==0)contents.push({type,quantity});}
 return {factions:[...new Set(factions.length?factions:release.faction?[release.faction]:[])],contents,hasParts:parts.length>0,hasFileCard,...(release.classification_mode==='automatic'?{classification:classifyContents(parts,!!release.contents_complete,release.kind)}:{})};
}
