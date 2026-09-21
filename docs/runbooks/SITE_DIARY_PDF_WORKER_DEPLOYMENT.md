# Site Diary PDF worker — live deployment runbook

**Phase:** 2D-1 infrastructure readiness  
**Status:** Operational guide for the **next** controlled live phase (not executed in 2D-1)

## Prerequisites

- Supabase project with Zlog schema migrations applied in order (see below).
- Railway (or equivalent) Node **20** Linux worker service.
- `SUPABASE_SERVICE_ROLE_KEY` stored only in Railway secrets (never in the client).
- Client enqueue / poll / download API routes are **not** required for initial worker-only smoke test.

## Migration order (apply in Supabase SQL / `db push` when authorized)

1. `supabase/migrations/20260921120000_site_diary_pdf_exports.sql` — job table, enqueue/get RPCs
2. `supabase/migrations/20260921140000_site_diary_pdf_export_worker_state.sql` — claim/complete/fail RPCs
3. `supabase/migrations/20260921160000_site_diary_pdf_exports_storage.sql` — private `site-diary-pdf-exports` bucket

Do not skip or reorder.

## Storage contract

| Item | Value |
|------|--------|
| Bucket id | `site-diary-pdf-exports` |
| Public | **No** (`public = false`) |
| Object path | `{owner_id}/{report_id}/{content_fingerprint}.pdf` |
| Upload MIME | `application/pdf` |
| Bucket limit | 100 MiB per object (`104857600` bytes) — above ~18–20 MiB baseline diaries |

Worker uses **service_role** Storage API. No `storage.objects` policies are added in 2D-1; worker does not need authenticated-user Storage grants.

Future user download: authorized server/API → short-lived signed URL (not public bucket, not browser-wide listing).

## Railway build settings

Repository root as working directory.

| Step | Command |
|------|---------|
| Install | `npm ci` |
| Build | `npm run build:worker-site-diary-pdf` |

`worker/site-diary-pdf-export/dist/` is **gitignored**; the bundle **must** be produced on Railway during build.

## Railway start settings

| Setting | Value |
|---------|--------|
| Start command | `npm run worker:site-diary-pdf-export` |
| Node | 20.x (matches esbuild `node20` target) |

Native dependency **sharp** is installed via `npm ci` on Linux (required by the bundled PDF pipeline externals).

## Environment variables

| Variable | Class | Notes |
|----------|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Required secret** | Service role only; never expose to Next.js client |
| `SUPABASE_URL` | **Required config** | Project API URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional fallback | Used only if `SUPABASE_URL` unset (`env.js`) |
| `ZLOG_PDF_WORKER_CLAIM_ENABLED` | **Safety switch** | Must be `false` or **omitted** for first deploy |
| `ZLOG_PDF_WORKER_ID` | Optional config | Stable worker identity for lease/complete; default `worker-<pid>` |
| `ZLOG_PDF_WORKER_POLL_MS` | Optional config | Default `5000`; clamped 1000–300000 |

**Do not** set `ZLOG_PDF_WORKER_CLAIM_ENABLED=true` until migrations, bucket, and idle health are verified.

## Initial deployment (claims disabled)

1. Apply migrations 1–3 on target Supabase.
2. Deploy Railway worker with claims **disabled**.
3. Confirm logs:
   - `Worker starting.`
   - `Claim enabled: no`
   - `Claim execution disabled. Set ZLOG_PDF_WORKER_CLAIM_ENABLED=true...`
   - No claim RPC errors (claims must not run).
4. Confirm build log shows `worker-pdf-pipeline.mjs` written.

## Enable claims gate (later step)

Only after the above:

1. Set `ZLOG_PDF_WORKER_CLAIM_ENABLED=true` on Railway.
2. Redeploy or restart worker.
3. Expect: `Claim execution enabled.` and claim/execute log lines when jobs exist.
4. Monitor safe metadata only (`exportId`, `reportId`, `state`, `code`) — never full job rows.

## Rollback / disable (no destructive DB rollback)

- Set `ZLOG_PDF_WORKER_CLAIM_ENABLED=false` (or remove variable) and restart worker.
- Worker returns to idle polling without claiming.
- **Do not** assume deleting export rows or Storage objects is required for disable.
- Failed/ready rows and uploaded PDFs remain for audit; re-enable claims when ready.

## Post-deployment smoke test (worker-only)

With claims enabled and a **test** export row enqueued via SQL/RPC (when API not live):

1. Row transitions `queued` → `processing` → `ready` or `failed`.
2. On `ready`: `storage_path` matches `{owner_id}/{report_id}/{fingerprint}.pdf`.
3. Object exists in `site-diary-pdf-exports` (dashboard or service-role check only).
4. No public URL for the object.

## Out of scope for first live worker

- Next.js enqueue/poll/download UI
- Share Report changes
- Automatic migration apply from CI without explicit approval
