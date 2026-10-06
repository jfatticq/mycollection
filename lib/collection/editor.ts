import type { z } from 'zod';
import type { entryInput } from './input';
export type EntryDraft = z.infer<typeof entryInput>;
export type CatalogPart = {
    id: string;
    name: string;
    kind: string;
    parent_id: string | null;
    expected_quantity: number | null;
};
export type Release = {
    id: string;
    name: string;
    kind: string;
    year: number | null;
    line: string | null;
    revision: number;
    retired: number;
    image_id?: string | null;
    ownership_status?: string;
};
export type CatalogDetail = {
    release: Release & Record<string, unknown>;
    parts: CatalogPart[];
    fileCards: {
        id: string;
        text: string;
    }[];
    images: {
        id: string;
        link_id:string;
        url: string;
        release_id: string | null;
        part_id: string | null;
        file_card_id: string | null;
    }[];
    related: {
        id: string;
        name: string;
        kind: string;
    }[];
};
export type OwnedEntry = Omit<EntryDraft, 'parts'> & {
    id: string;
    parts: (EntryDraft['parts'][number] & {
        label: string;
    })[];
    needsReview: boolean;
    line: string | null;
    year: number | null;
    kind?: string;character?:string;series?:string;sub_series?:string;wave?:string;scale?:string;faction?:string;market?:string;manufacturer?:string;product_code?:string;upc?:string;
};
export function draftFromEntry(entry: OwnedEntry): EntryDraft {
    // Do not post read-only catalog metadata or private ownership IDs back to the API.
    return { id: entry.id, name: entry.name, releaseId: entry.releaseId ?? null, ownership: entry.ownership, condition: entry.condition, completeness: entry.completeness, packaging: entry.packaging, sealed: entry.sealed, reviewedRevision: entry.reviewedRevision, notes: entry.notes, location: entry.location, acquiredAt: entry.acquiredAt, purchasePriceCents: entry.purchasePriceCents, purchaseCurrency: entry.purchaseCurrency, purchaseSource: entry.purchaseSource, parts: entry.parts.map(p => ({ partId: p.partId, quantity: p.quantity, condition: p.condition, defects: p.defects })), unidentifiedParts: entry.unidentifiedParts.map(p => ({ ...p })), photos: [...new Set(entry.photos ?? [])] };
}
export function newDraft(detail?: CatalogDetail): EntryDraft {
    return { name: detail?.release.name ?? '', releaseId: detail?.release.id ?? null, condition: 'Unknown', completeness: 'Not sure', packaging: 'unknown', sealed: null, reviewedRevision: detail?.release.revision ?? null, notes: '', location: null, acquiredAt: null, purchasePriceCents: null, purchaseCurrency: null, purchaseSource: null, parts: detail?.parts.map(p => ({ partId: p.id, quantity: null, condition: null, defects: '' })) ?? [], unidentifiedParts: [], photos: [] };
}
export function quickChoice(draft: EntryDraft, choice: EntryDraft['completeness'], parts: CatalogPart[]): EntryDraft {
    if (draft.id)
        return { ...draft, completeness: choice };
    return { ...draft, completeness: choice, ownership: undefined, packaging: choice === 'Complete' ? 'present' : 'unknown', parts: parts.map(p => ({ partId: p.id, quantity: choice === 'Complete' ? p.expected_quantity : null, condition: null, defects: '' })) };
}
export function nullableQuantity(value: string): number | null { return value.trim() === '' ? null : Number(value); }
