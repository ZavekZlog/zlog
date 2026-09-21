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

---

## Phase 2C-2A — Worker claim / lease state (database only)

**Version:** 1.1 (append)
**Date:** 2026-09-21
**Status:** Worker RPC foundation — **no** worker process, Storage bucket, or HTTP API in this phase

Migration: `supabase/migrations/20260921140000_site_diary_pdf_export_worker_state.sql`
Does **not** modify `20260921120000_site_diary_pdf_exports.sql`.

### Additional columns

| Column | Type | Notes |
|--------|------|--------|
| `lease_expires_at` | `timestamptz` | Set on claim/reclaim; cleared on `ready` / `failed` |
| `locked_by` | `text` | Worker identity from `p_worker_id`; cleared on terminal states |
| `reclaim_count` | `integer NOT NULL DEFAULT 0` | Stale lease recoveries only; CHECK `>= 0` |

### Claim indexes

- `site_diary_pdf_exports_queued_created_idx` — `created_at ASC` WHERE `status = 'queued'`
- `site_diary_pdf_exports_processing_lease_idx` — `lease_expires_at ASC` WHERE `status = 'processing'`

### Atomic claim: `claim_next_site_diary_pdf_export(p_worker_id text)`

- **`SECURITY DEFINER`**, `search_path = pg_catalog, public`
- **`service_role` only** — `REVOKE` from `PUBLIC` and `authenticated`; `GRANT EXECUTE` to `service_role`
- Rejects null/blank `p_worker_id`
- Returns claimed row as `jsonb`, or `NULL` when no eligible job

**Concurrency:** inside one function, each candidate row is selected with **`FOR UPDATE SKIP LOCKED`** so two Railway workers cannot claim the same row.

**Eligible rows (in priority order):**

1. `status = 'queued'`
2. `status = 'processing'` AND `lease_expires_at IS NOT NULL` AND `lease_expires_at < now()` (stale lease)

**Ordering:** queued before stale processing; then oldest `created_at` first.

**Queued claim:**

- `status` → `processing`
- `started_at` → `COALESCE(started_at, now())`
- `lease_expires_at` → `now() + 20 minutes`
- `locked_by` → `p_worker_id`
- `reclaim_count` unchanged

**Stale reclaim** (same row stays `processing`):

- `lease_expires_at` → `now() + 20 minutes`
- `locked_by` → `p_worker_id`
- `reclaim_count` → `reclaim_count + 1`
- `started_at` unchanged

**Stale reclaim limit:** maximum **3** reclaims (`reclaim_count` must be `< 3` to reclaim). When a stale row has `reclaim_count >= 3`, the claim function **fails that row** (not returned as a claim):

- `status` → `failed`
- `error_code` → `processing_timeout`
- `error_message` → generic non-sensitive text
- `completed_at` → `now()`
- `lease_expires_at` / `locked_by` → `NULL`

Then the claim loop continues to the next eligible job.

### Complete: `complete_site_diary_pdf_export(p_export_id, p_storage_path, p_byte_size, p_worker_id)`

- **`service_role` only**
- Requires: row exists; `status = 'processing'`; `locked_by = p_worker_id`; lease **not** expired (`lease_expires_at >= now()`); non-blank `p_storage_path`; `p_byte_size >= 0`
- On success: `status = ready`, `storage_path`, `byte_size`, `completed_at = now()`, clear `lease_expires_at`, `locked_by`, `error_code`, `error_message`
- Wrong worker or expired lease **cannot** complete

### Fail: `fail_site_diary_pdf_export(p_export_id, p_error_code, p_error_message, p_worker_id)`

- **`service_role` only**
- Requires: row exists; `status = 'processing'`; `locked_by = p_worker_id`
- `p_error_code` non-blank; `p_error_message` trimmed and bounded (max 500 chars); default generic message if blank
- On success: `status = failed`, `error_code`, `error_message`, `completed_at = now()`, clear `lease_expires_at`, `locked_by`
- No stack traces or secrets in stored messages

### Worker RPC boundary

| RPC | Caller |
|-----|--------|
| `enqueue_site_diary_pdf_export`, `get_site_diary_pdf_export` | `authenticated` (2C-1) |
| `claim_next_site_diary_pdf_export`, `complete_site_diary_pdf_export`, `fail_site_diary_pdf_export` | **`service_role` only** |

Enqueue already proved ownership; the worker does **not** use end-user JWTs. Application-level retry/backoff, heartbeat, and lease extension are **out of scope** for 2C-2A.

### Non-goals (Phase 2C-2A)

- Heartbeat / lease-extension RPCs
- Railway worker binary, cron, in-worker retry engine
- Storage bucket creation or upload
- HTTP enqueue/poll/download routes
- Changes to PDF assembly, rendering, or client Share
