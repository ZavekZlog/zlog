# Site Diary PDF export job (durable state)

**Version:** 1  
**Date:** 2026-09-21  
**Status:** Foundation — database state + ownership-checked RPCs only  

## Purpose

Durable asynchronous Site Diary PDF export **job state** for server-generated PDFs. This contract does **not** run PDF assembly, rendering, Storage upload, workers, HTTP routes, or client Share UX.

Content identity for jobs uses **`SITE_DIARY_PDF_SNAPSHOT_V1`** fingerprint namespace v2 (`lib/site-diary-pdf-snapshot-v1.js`, `docs/contracts/SITE_DIARY_PDF_SNAPSHOT_V1.md`).

## Table: `site_diary_pdf_exports`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `report_id` | `uuid` FK → `daily_reports(id)` ON DELETE CASCADE | |
| `owner_id` | `uuid` NOT NULL | **Derived from `projects.owner_id`** — never client-supplied |
| `project_id` | `uuid` FK → `projects(id)` ON DELETE CASCADE | From owning report |
| `content_fingerprint` | `text` NOT NULL | Lowercase 64-char SHA-256 hex |
| `snapshot_version` | `integer` NOT NULL | Snapshot normalizer version (e.g. `1`) |
| `status` | `text` NOT NULL | `queued` \| `processing` \| `ready` \| `failed` |
| `storage_bucket` | `text` NOT NULL | Initial value `site-diary-pdf-exports` |
| `storage_path` | `text` | Null until `ready` |
| `byte_size` | `bigint` | Null until known |
| `error_code` | `text` | Set on `failed` |
| `error_message` | `text` | Truncated safe message on `failed` |
| `attempt` | `integer` NOT NULL DEFAULT `1` | Increments on re-enqueue after `failed` |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `started_at` | `timestamptz` | Set when worker claims (future) |
| `completed_at` | `timestamptz` | Set on terminal `ready` / `failed` |

### Constraints

- `content_fingerprint` must match `^[0-9a-f]{64}$`
- `status` CHECK: only `queued`, `processing`, `ready`, `failed`
- **Partial unique index (active work):** `(report_id, content_fingerprint)` WHERE `status IN ('queued', 'processing')`

`ready` and `failed` rows are **not** covered by the active unique index.

## Status lifecycle

| Status | Meaning |
|--------|---------|
| `queued` | Accepted; awaiting worker (future phase) |
| `processing` | Worker claimed (future phase) |
| `ready` | Artifact path recorded; immutable for that fingerprint |
| `failed` | Terminal failure; not a cache hit |

**Allowed transitions (full system; worker steps are future):**

```text
enqueue → queued
queued → processing   (worker — future)
processing → ready    (worker — future)
processing → failed   (worker — future)
failed → queued       (re-enqueue via RPC — new attempt row)
ready → (none)        (immutable for that content_fingerprint)
```

## Content identity

Logical key: **`(report_id, content_fingerprint)`**.

`content_fingerprint` is the lowercase 64-character SHA-256 from:

```text
SHA-256( "zlog-site-diary-pdf:v2:" + canonicalJson )
```

Computed server-side at enqueue time in a future phase; the enqueue RPC **validates format only** in this foundation phase.

## Security

Preserve Site Diary ownership invariant:

```text
authenticate user → daily_reports → projects.owner_id = auth.uid()
```

- **RLS:** authenticated users may **SELECT** only rows where `owner_id = auth.uid()`.
- **No** authenticated INSERT/UPDATE/DELETE on the table (mutations via `SECURITY DEFINER` RPCs only in this phase).
- Service-role worker policies are **out of scope** for Phase 2C-1.

## RPC: `enqueue_site_diary_pdf_export`

**Inputs:** `p_report_id uuid`, `p_content_fingerprint text`, `p_snapshot_version integer`  
**Does not accept** `owner_id`.

**Behaviour:**

| Case | Action |
|------|--------|
| Unauthenticated | Reject |
| Report not owned | Reject |
| Invalid fingerprint / snapshot version | Reject |
| Existing **`ready`** for same pair | Return that row (no new job) |
| Existing **`queued`** or **`processing`** | Return that row (no duplicate active job) |
| Only **`failed`** (or no row) | Insert new **`queued`** row; `attempt` = max prior attempt + 1 for pair |
| Concurrent duplicate enqueue | Partial unique index + safe catch → return existing active row |

Sets `storage_bucket` to `site-diary-pdf-exports`. Does not create Storage objects.

## RPC: `get_site_diary_pdf_export`

**Input:** `p_export_id uuid`  
Returns the export row as `jsonb` for `owner_id = auth.uid()` only. No signed URLs.

## Storage (future)

- Private bucket name: `site-diary-pdf-exports` (not created in 2C-1).
- Deterministic path (future): `{owner_id}/{report_id}/{content_fingerprint}.pdf`

## Non-goals (Phase 2C-1)

- PDF worker, cron, queue consumer
- `assembleSiteDiaryPdfDocumentProps` / `renderSiteDiaryPdfBuffer`
- Storage bucket creation, upload, signed download URLs
- HTTP API routes, phone polling UI
- Changes to client Share / snapshot rules

## Related contracts

- `docs/contracts/SITE_DIARY_PDF_SNAPSHOT_V1.md`
- `lib/site-diary-pdf-snapshot-v1.js`
