export const partTypes=['figure','vehicle','accessory','packaging','paperwork','other'] as const;
export type PartType=typeof partTypes[number];
export const partTypeLabels:Record<PartType,string>={figure:'Figure',vehicle:'Vehicle',accessory:'Accessory',packaging:'Packaging',paperwork:'Paperwork',other:'Other Part'};
export function physicalPartType(kind:string,releaseKind:string):PartType{
 if(kind==='packaging'||kind==='paperwork'||kind==='accessory')return kind;
 return kind==='primary'&&(releaseKind==='figure'||releaseKind==='vehicle')?releaseKind:'other';
}
export function partRole(partType:PartType,mainComponent:boolean):'primary'|'accessory'|'packaging'|'paperwork'{
 return partType==='packaging'||partType==='paperwork'?partType:mainComponent?'primary':'accessory';
}
