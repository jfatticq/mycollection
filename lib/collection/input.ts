import { z } from 'zod';
import { AccessError } from '@/lib/auth/access';
export const grade = z.enum(['Mint', 'Excellent', 'Good', 'Fair', 'Poor', 'Unknown']);
const quantity = z.number().int().min(0).max(9999).nullable();
export const entryInput = z.object({
    id: z.string().min(1).max(128).optional(), releaseId: z.string().min(1).max(128).nullable().optional(),
    name: z.string().trim().min(1).max(200), quantity: z.literal(1).optional(),
    ownership: z.enum(['owned', 'parts_only', 'unconfirmed']).optional(), condition: grade.default('Unknown'),
    completeness: z.enum(['Complete', 'Partial', 'Not sure']).default('Not sure'),
    packaging: z.enum(['present', 'absent', 'unknown']).default('unknown'), sealed: z.boolean().nullable().default(null),
    reviewedRevision: z.number().int().positive().nullable().default(null),
    notes: z.string().max(6000).default(''), location: z.string().max(200).nullable().default(null),
    acquiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;},'Use a valid calendar date.').nullable().default(null),
    purchasePriceCents: z.number().int().min(0).max(1000000000).nullable().default(null),
    purchaseCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null), purchaseSource: z.string().max(500).nullable().default(null),
    parts: z.array(z.object({ partId: z.string().min(1).max(128), quantity, condition: grade.nullable().default(null), defects: z.string().max(2000).default('') }).strict()).max(500).default([]),
    unidentifiedParts: z.array(z.object({ name: z.string().trim().min(1).max(200), quantity, condition: grade.nullable().default(null), defects: z.string().max(2000).default('') }).strict()).max(500).default([]),
    photos: z.array(z.string().regex(/^\/api\/photo\?id=[a-f0-9-]{36}$/)).max(10).optional(),
}).strict();
export type Part = {
    id: string;
    kind: string;
    expected_quantity: number | null;
    retired: number;
};
export function validateParts(item: z.infer<typeof entryInput>, parts: Part[], newEntry: boolean) {
    if (new Set(item.parts.map(p => p.partId)).size !== item.parts.length)
        throw new AccessError(400, 'Duplicate part quantities.');
    for (const p of item.parts)
        if (!parts.some(k => k.id === p.partId))
            throw new AccessError(400, 'Part does not belong to this release.');
    if (item.completeness === 'Complete') {
        if (!item.releaseId || !parts.length || parts.some(p => !p.retired && p.expected_quantity === null))
            throw new AccessError(400, 'Complete requires a verified catalog parts list.');
        if (newEntry && !item.parts.length)
            item.parts = parts.filter(p => !p.retired).map(p => ({ partId: p.id, quantity: p.expected_quantity, condition: null, defects: '' }));
        if (newEntry && item.packaging === 'unknown')
            item.packaging = 'present';
        if (item.packaging !== 'present' || parts.some(p => !p.retired && (item.parts.find(q => q.partId === p.id)?.quantity ?? -1) < p.expected_quantity!))
            throw new AccessError(400, 'Complete requires original packaging and every expected part.');
    }
    const primary = parts.filter(p => p.kind === 'primary' && !p.retired);
    const quantities = primary.map(p => item.parts.find(q => q.partId === p.id)?.quantity ?? null);
    const anyPrimary = quantities.some(q => q !== null && q > 0);
    const noPrimary = quantities.length > 0 && quantities.every(q => q === 0);
    const anyPart = item.parts.some(p => p.quantity !== null && p.quantity > 0) || item.unidentifiedParts.some(p => p.quantity !== null && p.quantity > 0);
    if (item.ownership === 'owned' && noPrimary || item.ownership === 'parts_only' && anyPrimary)
        throw new AccessError(400, 'Ownership conflicts with the primary-part quantities.');
    return item.ownership ?? (anyPrimary ? 'owned' : noPrimary && anyPart ? 'parts_only' : 'unconfirmed');
}
