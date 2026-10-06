# Catalog reliability

The catalog is a set of imported observations, not a complete master list. Identity verification, accessory review, and source-index coverage are independent statuses.

## Identities and packages

`lib/catalog-identities.json` records exact versions, record types, field evidence, source identifiers, unresolved conflicts and figure/package relationships. Older entries infer a provisional type from their source category; they remain partial. `canonicalId` retains historical aliases, so user records do not need a bulk rewrite. Do not collapse figure and package records because they share a source page, name or barcode. Source IDs are scoped to their source. Retailer SKUs are scoped to the retailer; GTINs are strings, preserve zeroes, validate the check digit, and normalize to 14 digits. Valid formatting does not authenticate an item.

The Copperhead US 3.75-inch archive family (eight versions, 1984–2010) is the first reconciled family audit. It excludes international products, undisclosed variants and later figures. Ace v1 / Skystriker and Copperhead v7 / Gung-Ho v20 / Walmart two-pack demonstrate independent figure and package records. Source-year disagreements for older imported packages remain explicit conflicts.

## Ownership

Unknown records can save `line: Unknown`, `year: null`, `identificationStatus: unidentified`, and photos/notes/condition/physical counts. Linking uses exact selection, keeps the owned record ID and physical observations, records identity history, merges expected parts without replacing counts, and invalidates earlier price assumptions. Expected pieces start unconfirmed. Part quantity zero means absent, positive means present, blank means unchecked.

## Reviews and audit checks

Reports, evidence photo associations and review decisions are persisted in D1, with schema-only migrations. Uploaded bytes remain in existing R2 storage. All review reads and writes enforce the existing owner authorization. Writes additionally require same origin. Review decisions do not silently change catalog source facts or erase owned records.

Catalog health shows line/year identity and parts counts, source checks, stale audit snapshots, valid/invalid barcode formats, and duplicate candidates. Human audit counts must use the same basis (figures, packages/vehicles or all entries). A reconciliation cannot be saved with unequal counts; matching counts are still not proof of coverage. The owner records compared entries, exclusions and findings. Full-worldwide completeness is never implied.

The `related-versions` endpoint checks an exact mapped YoJoe figure archive, reads its explicit version-family links, and compares them against exact catalog URLs and curated accessory mappings. Results are cached for a day with their check timestamp. Unlinked versions are candidates, not automatically invented releases. A missing-source mapping or source outage is a recoverable, visible state. No arbitrary source-fetch URL is accepted.

## Valuation

Unreviewed guide references remain visible but are excluded from collection totals. A figure cannot inherit its original package's price. Matching confirmed sales and owner estimates take priority; provisional baselines require the same physical product form, known condition/packaging, valid explained adjustments and a current item-state signature. Linking a new identity clears the prior manual estimate and invalidates confirmed sale matches. The header reports valued and unvalued records rather than claiming a complete total.

## Refresh

`prepare-catalog-reliability.py` checks the eight exact Copperhead pages; `complete-figure-relationships.py` and `add-gung-ho-relationship.py` capture their reviewed package links and Ace/Gung-Ho examples. These are bounded curations, not an exhaustive importer. `import-accessory-images.py` now preserves existing metadata when older source caches are absent. New audits should be scoped and source-backed, not inferred from successful bulk import counts.

Validation: TypeScript; collection accessory and photo regression checks; catalog reliability checks for GTIN/SKU normalization, identity/link preservation, valuation isolation, exact-source parser, owner/origin authorization, persistent review associations, and schema migration validity. Browser interaction QA was not performed in this update.
