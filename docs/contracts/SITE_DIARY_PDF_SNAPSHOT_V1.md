# Site Diary PDF Snapshot v1

**Version:** 1  
**Date:** 2026-09-21  
**Status:** Foundation — normalization + fingerprint only  

## Purpose

`lib/site-diary-pdf-snapshot-v1.js` defines a **pure, deterministic** snapshot of Site Diary state that affects generated PDF content. The snapshot supports a stable **content fingerprint** for future durable PDF jobs, server-side artifact storage, and cache convergence.

**This contract does not change PDF generation, layout, or Share behaviour.** No worker, job table, polling, artifact bucket, or workbench integration is introduced here.

## Exported contract

- **`SITE_DIARY_PDF_SNAPSHOT_V1`** — version metadata and functions:
  - `normalize(raw)` — PDF-relevant normalized object (does not mutate input)
  - `canonicalJson(raw)` / `canonicalSerialize(value)` — compact canonical JSON
  - `fingerprint(raw)` — SHA-256 lowercase hex content fingerprint

## Fingerprint namespace (v2)

The digest is:

```text
SHA-256( "zlog-site-diary-pdf:v2:" + canonicalJson )
```

- Namespace constant: `SITE_DIARY_PDF_FINGERPRINT_NAMESPACE` / `fingerprintNamespace`
- Output: **64-character lowercase hexadecimal** string
- Normalization rules are **v1**; the hash prefix is **v2** so future snapshot rule versions can bump the namespace without silently reusing old digests.

## v1 normalization rules

1. **Pure functions** — input objects are never mutated.
2. **Scalars** — trim strings; empty strings become `null`. Optional scalar fields are always present on the normalized object, using `null` when absent.
3. **Numbers** — finite numbers only; invalid or missing numbers become `null`.
4. **Booleans** — only explicit `true` / `false` are preserved; otherwise `null`.
5. **Collections** — always arrays in the normalized snapshot; use `[]` when absent.
6. **Photo rotation** — normalized to `0`, `90`, `180`, or `270` (same snapping rules as PDF layout).
7. **Canonical JSON** — recursive lexicographic sort of object keys; array order is preserved after normalization sorting.
8. **Compact JSON** — no insignificant whitespace; fingerprints must not depend on formatting.

## Included state (PDF content identity)

Persisted, visibly rendered or PDF-embedded content, including:

| Area | Identity captured |
|------|-------------------|
| Report | Date, number (when rendered), weather, shift, site summary, current phase |
| Project | Name, reference, address, project manager, programme dates, working days per week |
| Reporting | Reporting company name, reporting on behalf of, author name and role |
| Branding | Brand colour, durable logo storage path |
| Cover | Durable cover path + `processing_version` |
| Signature | Durable signature path |
| Sign-in sheet | Durable attendance register / evidence path |
| Narrative | Visitors text, delays/issues, actions |
| Visitors provenance | Evidence path, source row, trade, times |
| Labour | Sequence, trade, company, count, hours, notes |
| Plant | Sequence, item, reference, status, notes |
| Equipment hire | Description, supplier, quantity, status |
| Temporary works | Type, location, status, reference, check result, notes, scaffold check/tag |
| Permits | Stable id, order, type, reference, issued to, status, durable form photo path |
| H&S / RFIs / Variations | Stable id + PDF-visible fields |
| Work photos | Durable storage path, `processing_version`, `report_byte_size` (when supplied), sequence, caption, location, layout, rotation, `assigned_to` |

### Database IDs vs visible identity

- **`report.id` and `project.id` do not affect the fingerprint** when they differ only as database identifiers.
- IDs are included only when they are **explicitly part of visible PDF content** (e.g. opt-in `includeReportIdInPdf` / `includeProjectIdInPdf` on the input adapter).

## Excluded state

Not part of the snapshot (must not change the fingerprint):

- Timestamps that do not affect PDF content (`updated_at`, `created_at`, cache timestamps, etc.)
- Signed URLs, blob URLs, local/browser URLs, and downloaded image bytes
- Thumbnail-only metadata (`thumbnail_path`, thumbnail dimensions/byte sizes, etc.)
- Transient UI state (loading, selection, scroll, in-memory previews)
- Performance / session cache keys
- **Deliveries** until persisted to the report record
- **Non-persisted work-area records** (`photoAreas` with `persisted: false` are skipped)
- Ephemeral photos without a durable storage path

## Deterministic collection ordering

After field normalization, collections are sorted by persisted semantic keys:

| Collection | Sort keys |
|------------|-----------|
| Work photos | `sequence`, then `storage_path` |
| Labour | `sequence`, `trade`, `company` |
| Plant | `sequence`, `item`, `ref` |
| Equipment hire | `description`, `supplier`, `quantity`, `status` |
| Temporary works | `sequence`, stable id, `reference` |
| Permits | `sequence`, stable id, `reference` |
| Visitors provenance | `evidence_path`, `source_row` |
| H&S / RFIs / Variations | stable id, then canonical row payload |

## Content identity vs future job identity

- **Content fingerprint** — hash of normalized PDF-relevant state (this contract).
- **Future job identity** — may additionally bind artifact storage keys, enqueue timestamps, or worker lease metadata. Those job-layer fields must **not** be mixed into the content snapshot; jobs should reference the content fingerprint, not redefine it.

## Relationship to legacy share cache fingerprint

`buildSharePdfFingerprint` in `lib/diary-pdf-cache.js` remains the **legacy IndexedDB share-cache** string fingerprint. It is **not** replaced or modified by this contract. New durable PDF infrastructure should use `SITE_DIARY_PDF_SNAPSHOT_V1.fingerprint` for content identity.

## Non-goals (Phase 2B-1)

- PDF rendering changes
- Job table, worker, artifact bucket, polling, or convergence UI
- Cover thumbnail pipeline or workbench wiring

Manual validation: run `node --test lib/site-diary-pdf-snapshot-v1.test.js` and `npm run test:release` when authorised.
