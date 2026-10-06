import identities from './catalog-identities.json';
export type Evidence={source:string;checked:string;status:string};
export function identityFor(release:any){
 if(!release)return {status:'unverified',entityType:'unidentified',fields:{},sources:[],related:[],conflicts:[]};
 const fixed=(identities as Record<string,any>)[release.id]||{};
 const host=(()=>{try{return new URL(release.url).hostname;}catch{return '';}})();
 const sourceName=host.includes('yojoe')?'YoJoe':host.includes('3djoes')?'3DJoes':host.includes('actionfigure411')?'ActionFigure411':'Source';
 const entityType=fixed.entityType||(release.kind==='Vehicle / playset'?'vehicle':/comic-packs|multi-packs|multipacks|5-packs|7-packs|box-sets|sets\//.test(release.url||'')?'package':'figure');
 const fields:Record<string,Evidence>={};for(const key of ['name','year','line','kind','image'])if(release[key])fields[key]={source:release.url,checked:release.checked||'',status:'imported'};
 for(const key of ['upc','sku','manufacturerCode','originalRetailPrice','wave','series'])if(release[key])fields[key]={source:release.metadataSource||release.url,checked:release.metadataChecked||release.checked||'',status:'imported'};
 return {status:'partial',entityType,version:'Not recorded',scale:release.line==='Classified'?'6-inch':release.line==='Sigma 6'?'Not verified':'3.75-inch',sources:[{url:release.url,name:sourceName,sourceId:host.includes('yojoe')?release.url.split('/').pop():release.id,checked:release.checked||''}],related:[],conflicts:[],...fixed,fields:{...fields,...fixed.fields}};
}
export function normalizeGTIN(value:any):string|null{
 const digits=String(value||'').replace(/[\s-]/g,'');if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits))return null;
 let sum=0;for(let i=digits.length-2,m=3;i>=0;i--,m=m===3?1:3)sum+=Number(digits[i])*m;
 if((10-sum%10)%10!==Number(digits.at(-1)))return null;return digits.padStart(14,'0');
}
export function scopedSKU(value:string,issuer:string){return value?.trim()&&issuer?.trim()?issuer.trim().toLowerCase()+':'+value.trim():null;}
export function duplicateCandidates(catalog:any[]){
 const groups=new Map<string,any[]>();for(const r of catalog){const gtin=normalizeGTIN(r.upc);const sku=scopedSKU(r.sku,r.skuRetailer||r.retailer||r.skuIssuer||'');const identity=identityFor(r),source=identity.sources[0];const sourceKey=identity.entityType==='figure'&&source?.sourceId?source.name+':'+source.sourceId:null;const keys=[sourceKey&&'source:'+sourceKey,gtin&&'gtin:'+gtin,sku&&'sku:'+sku,'name:'+r.line+':'+r.year+':'+r.name.toLowerCase().replace(/\bcobra\b|\bg i joe\b/g,'').replace(/[^a-z0-9]/g,'')].filter(Boolean) as string[];for(const key of keys)groups.set(key,[...(groups.get(key)||[]),r]);}
 const seen=new Set<string>();const candidates:any[]=[];for(const [key,rows] of groups)for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const ids=[rows[i].id,rows[j].id].sort(),id=ids.join('~');if(seen.has(id))continue;seen.add(id);candidates.push({id,left:rows[i],right:rows[j],reason:key.startsWith('gtin:')?'Same valid GTIN':key.startsWith('sku:')?'Same issuer-scoped SKU':key.startsWith('source:')?'Same source identity':'Similar name, same line and year',evidence:key,needsReview:identityFor(rows[i]).entityType!==identityFor(rows[j]).entityType?'Different record types: may be a figure / package relationship':'Check paint, version, region and package contents before merging'});}
 return candidates.sort((a,b)=>Number(b.reason==='Same valid GTIN')-Number(a.reason==='Same valid GTIN'));
}
export function ownedForm(item:any,reference?:any){return item.ownedForm||identityFor(reference).entityType;}
export function linkItem(item:any,release:any,pieces:any[]){
 return {...item,releaseId:release.id,name:release.name,line:release.line,year:release.year,identificationStatus:'identified',ownedForm:identityFor(release).entityType,pieces,guidePrice:undefined,guideChecked:undefined,estimatedValue:'',estimateDate:'',baselineForm:'Unknown',baselinePrice:'',baselineCondition:'',baselinePackaging:'Unknown',adjustmentsReviewed:false,adjustmentState:'',comps:(item.comps||[]).map((c:any)=>({...c,confirmed:false})),identityHistory:[...(item.identityHistory||[]),{previousReleaseId:item.releaseId||null,previousName:item.name,releaseId:release.id,at:new Date().toISOString()}]};
}

export function coverageCount(catalog:any[],check:any){return catalog.filter(r=>r.line===check.line&&r.year===check.year&&(check.basis==='All catalog items'||(check.basis==='Figure versions'?identityFor(r).entityType==='figure':['package','vehicle'].includes(identityFor(r).entityType)))).length;}
