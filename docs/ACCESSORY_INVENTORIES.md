# Release-specific accessory inventories

Catalog inventories are separate from the owner's collection records. Opening a dossier merges its exact canonical release inventory; saving persists only the owner's record. Newly discovered parts are unconfirmed, never automatically present. Custom pieces, edits, quantities and owned counts survive imports. Matching uses a normalized label or persistent catalog key, never positional accessory IDs. Catalog quantities are recorded separately so differences remain visible.

## Coverage and provenance

- **Unverified**: no sourced inventory. Main item and paperwork are starter entries, not a complete set of expected contents.
- **Partial**: a source provides a gear list or vehicle component captions. Small parts, quantities or paperwork may still be missing. Legacy imports default to partial; a successful parser does not prove completeness.
- **Reviewed**: a curator checked the complete inventory against the exact release, including relevant source photos. The record includes its review note and date.

`/accessory-coverage` audits every canonical release by line and status and opens dossiers. Each inventory stores a source URL, check date and release-match note. Count totals exclude aliases. Unknown vehicle component quantities remain explicitly unverified, rather than implied to be one.

## Updating data

Run `python scripts/import-accessories.py --cache /tmp/joe-accessory-cache`. Use `--offline --refresh-cache` to reparse captured pages, `--explicit-only` to check curated mappings, and `--limit N` for a bounded batch. Downloads have timeouts and use six workers. Page caches stay outside the repository. The importer checkpoints every 40 records. Review `lib/accessory-import-report.json` for unavailable or unstructured sources. Do not infer missing data from generic image captions, unrelated variants or construction descriptions.

Connected exact YoJoe URLs supply figure accessories and vehicle driver/component captions. Connected 3DJoes pages are checked too; unsupported layouts remain unresolved. Reviewed overrides and explicit release mappings live in `lib/accessory-sources.json`; unknown matches stay unverified. The initial 25th Anniversary additions require a unique exact normalized character name and year in both catalog and YoJoe index, with no fuzzy or cross-year matching. Their package variants still require review. Air Trooper 3308 has a documented exception: YoJoe's 2007 v1 page explicitly describes the wave 4 single-card rerelease that ActionFigure411 dates to 2008. Its reviewed single-card list excludes five-pack contents and 2011 v2.

Do not use a generic count of helmets for individually distinguishable parts when a reviewed source identifies them. Keep permanently attached components together; record a hose separately only when the source confirms removability. Vehicle panels, missiles and included figures require their own entries, supported by an inventory, component caption, manual or review; a single vehicle placeholder is insufficient.

The 1984 Rattler has a 3DJoes-supported override: component descriptions, pilot filecard, blueprint and parts photograph confirm its covers, panels, canopies, six bombs and eight missiles in three visibly distinct groups. The checklist remains partial for remaining small fittings and paperwork. Source scans and photos are inspected for facts but are not republished by this workflow.

## Owned counts

The dossier uses one count input per part: zero is missing, a positive whole number is present, and blank is unconfirmed. The catalog expected count is separate. `ownedQuantity` takes precedence; legacy checkbox records map checked to their recorded quantity, unchecked to zero, and indeterminate to blank. The legacy flag is derived for compatibility when editing. Catalog merges never fill owner counts from expected contents. Changing a count invalidates matching-price evidence; unchanged legacy records retain their existing evidence signatures.

## Accessory photo references

`python scripts/import-accessory-images.py` captures URLs, captions and credits from exact-release YoJoe pages already cached outside the checkout. It writes a server-side manifest, never guesses an image from another release, and keeps repeat captions (such as two helmets) as separate photos. Photo keys derive from image URLs so inserted source images do not shift cached identifiers. Figure galleries use the Accessories section; vehicle galleries use parts/component captions. A high-resolution front reference is captured separately.

The gallery API retrieves uncaptured YoJoe-backed releases on demand and caches their metadata. The binary API accepts only manifest keys, validates source host/type/size, and caches thumbnails and originals privately. Photo failures retain a direct link to the source. 3DJoes pages remain linked rather than adding new copies of its restricted photographs. Owner uploads use a `photos` array with the first image mirrored in legacy `photo` for card compatibility; old single-photo records remain visible. Removing a photo detaches it from the item and does not erase its storage object.
