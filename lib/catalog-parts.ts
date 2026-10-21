export const partTypes=['figure','vehicle','equipment','playset','accessory','packaging','paperwork','other'] as const;
export type PartType=typeof partTypes[number];
export const partTypeLabels:Record<PartType,string>={figure:'Figure',vehicle:'Vehicle',equipment:'Equipment / battle station',playset:'Playset / environment',accessory:'Accessory',packaging:'Packaging',paperwork:'Paperwork',other:'Other Part'};
export function physicalPartType(kind:string,releaseKind:string):PartType{
 if(kind==='packaging'||kind==='paperwork'||kind==='accessory')return kind;
 return kind==='primary'&&(['figure','vehicle','equipment','playset'] as string[]).includes(releaseKind)?releaseKind as PartType:'other';
}
export function partRole(partType:PartType,mainComponent:boolean):'primary'|'accessory'|'packaging'|'paperwork'{
 return partType==='packaging'||partType==='paperwork'?partType:mainComponent?'primary':'accessory';
}
