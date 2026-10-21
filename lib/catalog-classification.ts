import {physicalPartType, partTypes, type PartType} from '@/lib/catalog-parts';

export const releaseKinds = ['figure', 'multipack', 'companion', 'vehicle', 'equipment', 'playset', 'accessory', 'mixed', 'other'] as const;
export type ReleaseKind = typeof releaseKinds[number];
export const releaseKindLabels: Record<ReleaseKind, string> = {
  figure: 'Figure', multipack: 'Figure multipack', companion: 'Companion set', vehicle: 'Vehicle set', equipment: 'Equipment set',
  playset: 'Playset', accessory: 'Accessory set', mixed: 'Mixed set', other: 'Unclassified / other',
};
export type ClassificationPart = {
  kind?: string; partType?: string; part_type?: string | null; retired?: boolean | number;
  expectedQuantity?: number | null; expected_quantity?: number | null;
};
export function contentsChanged(before: (ClassificationPart & {id: string})[], after: (ClassificationPart & {id: string})[]) {
  const signature = (parts: (ClassificationPart & {id: string})[]) => JSON.stringify(parts.map(part =>
    [part.id, part.partType ?? part.part_type, part.expectedQuantity !== undefined ? part.expectedQuantity : part.expected_quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  return signature(before) !== signature(after);
}
export function classifyContents(parts: ClassificationPart[], complete = false, legacyKind = 'other') {
  const counts = new Map<PartType, {known: number; unknown: boolean}>();
  for (const part of parts) {
    if (part.retired) continue;
    const rawType = part.partType ?? part.part_type ?? physicalPartType(part.kind ?? 'accessory', legacyKind);
    const type: PartType = partTypes.includes(rawType as PartType) ? rawType as PartType : 'other';
    if (type === 'packaging' || type === 'paperwork') continue;
    const quantity = part.expectedQuantity !== undefined ? part.expectedQuantity : part.expected_quantity;
    if (quantity === 0) continue;
    const count = counts.get(type) ?? {known: 0, unknown: false};
    if (quantity == null) count.unknown = true;
    else count.known += quantity;
    counts.set(type, count);
  }
  let kind: ReleaseKind = 'other';
  // Figures accompanying larger toys do not turn the release into a figure pack.
  if (counts.has('playset')) kind = 'playset';
  else if (counts.has('vehicle') && counts.has('equipment')) kind = 'mixed';
  else if (counts.has('vehicle')) kind = 'vehicle';
  else if (counts.has('equipment')) kind = 'equipment';
  else if (counts.has('figure')) {
    const figures = counts.get('figure')!;
    kind = figures.known >= 2 ? 'multipack' : figures.unknown ? 'other' : 'figure';
  } else if (counts.has('companion')) kind = 'companion';
  else if (counts.has('accessory') && !counts.has('other')) kind = 'accessory';
  const provisional = !complete || !counts.size || counts.has('other') || [...counts.values()].some(count => count.unknown);
  const nouns: Record<string, [string, string]> = {figure: ['figure', 'figures'], companion: ['companion', 'companions'], vehicle: ['vehicle', 'vehicles'], equipment: ['equipment unit', 'equipment units'], playset: ['playset', 'playsets'], accessory: ['accessory', 'accessories'], other: ['other part', 'other parts']};
  const summary = [...counts].map(([type, count]) => {
    const [one, many] = nouns[type] ?? nouns.other;
    return count.unknown ? `${many} listed (quantity unknown)` : `${count.known} ${count.known === 1 ? one : many}`;
  }).join(' · ') || 'No toy contents listed';
  return {kind, label: releaseKindLabels[kind], provisional, summary};
}
