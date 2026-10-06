# The Joe Armory style guide

The visual direction is a collector's catalog and equipment dossier: navy structure, white working surfaces, steel secondary text and brass section labels. Archive imagery is factual; owner photos are clearly distinguished.

## Foundations

| Role | Colour |
|---|---|
| Main text | #152b3d |
| Primary action / value | #173e5f |
| Secondary text | #596d7f |
| Section accent | #8a6529 |
| Working surface | #ffffff |
| Secondary surface | #edf2f6 |
| Border | #cbd6df |
| Destructive action | #a32e2d |

Use Arial / Helvetica / sans-serif, 16px body and inputs, 14px labels and supporting text, 28px dossier titles and 21px section titles. Use 16px field gaps, 24px between sections, 44px minimum input/button height, 6px control corners and 10px panel corners. A 3px brass focus outline stays visible for keyboard users.

## Dossier layout

Use a single scrolling dialog, up to 1320px wide. Item and product fields have four columns at 1200px+, three at 900–1199px, two at 600–899px and one below 600px. Release names span two columns; notes span the full row. Keep accessory rows in two columns on wide screens and one on smaller screens. Reference and owner photography share a clearly labeled media section. Save/cancel actions stay visible at the bottom.

## Interaction states

- Enabled buttons use a pointer; editable text uses the normal text cursor.
- Disabled controls use a not-allowed cursor, never a perpetual busy cursor.
- Loading is an explicit, finite status message tied to an operation; network requests time out after 25 seconds.
- Locked editing shows the sign-in / owner status and an explicit route to sign in. Owner authorization remains enforced on every server write.
- The local file picker is visibly labeled and retains the native file selector.
- Camera access is requested only when the owner chooses Use camera. Capture previews have Take photo and Cancel actions; camera tracks stop on close or unmount. Permission failures explain the local-file alternative.
- Confirm uploads with a visible photo preview. Reject unsupported formats / oversized images before sending.
- Destructive accessory controls have specific accessible labels and red hover feedback.

The application uses app/armory-design.css. The published guide uses its identical public/armory-design.css copy; keep these synchronized when changing the guide.

## Photo galleries

Owner photos use a responsive grid with a cover marker, Make cover and Remove from item actions. File selection supports multiple images; camera capture appends rather than replacing. Changes remain part of the item form until saved. Every image has an Enlarge control above it, including accessory references. The image viewer uses most of the viewport, supports 100–400% zoom and scrolling, and links to the original. Viewer controls remain available in read-only dossiers. Source credits appear beneath accessory images.

Catalog evidence uses the same white surfaces, navy text/actions, steel secondary text and four-column form rhythm as the dossier. Verification labels must specify whether they describe identity, parts or source-index coverage. Unknown values use “Not recorded” / “Unidentified”; incomplete coverage must remain visible. The catalog-health tables scroll within their container on narrow screens, and comparison panels collapse to one column.
