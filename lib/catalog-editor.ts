import type { z } from 'zod';
import type { releaseInput } from '@/lib/catalog-store';
export type ReleaseDraft=z.infer<typeof releaseInput>;
export function releaseDraft(detail:any):ReleaseDraft{
  const r=detail.release;return {id:r.id,expectedRevision:r.revision,name:r.name,kind:r.kind,character:r.character,year:r.year,line:r.line,series:r.series,subSeries:r.sub_series,wave:r.wave,scale:r.scale,faction:r.faction,market:r.market,manufacturer:r.manufacturer,productCode:r.product_code,upc:r.upc,retailPriceCents:r.retail_price_cents,retailCurrency:r.retail_currency,retired:!!r.retired,
    parts:detail.parts.map((p:any)=>({id:p.id,parentId:p.parent_id,name:p.name,kind:p.kind,expectedQuantity:p.expected_quantity,sortOrder:p.sort_order,linkedReleaseId:p.linked_release_id})),fileCards:detail.fileCards.map((c:any)=>({id:c.id,text:c.text})),taxonomyIds:(detail.taxonomy??[]).map((t:any)=>t.id),related:detail.related.map((l:any)=>({id:l.id,kind:l.kind}))};
}
export function blankRelease():ReleaseDraft{return {name:'',kind:'figure',character:null,year:null,line:null,series:null,subSeries:null,wave:null,scale:null,faction:null,market:null,manufacturer:null,productCode:null,upc:null,retailPriceCents:null,retailCurrency:'USD',retired:false,parts:[],fileCards:[],taxonomyIds:[],related:[]};}
