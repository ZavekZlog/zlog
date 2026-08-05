# Live schema reconciliation report (M0-A)

**Host:** `epvkxavaxmzyskteecsv.supabase.co`  
**Source of truth:** live PostgREST OpenAPI + live SELECT/UPDATE (not local migrations)  
**Artifacts:** `LIVE_SCHEMA_DAILY_REPORTS.json`, `LIVE_UPDATE_SELECT_PROOF.json`, `LIVE_BAD_COLUMN_PROOF.json`, `LIVE_RLS_PROBE.json`  
**UI:** unchanged this pass  
**M0:** not marked passed (app Save still needs your confirmation)

---

## 1. Exact table

**`public.daily_reports`** — Site Diary / Today’s Report records.

---

## 2. Full live column list

`id`, `owner_id`, `project_id`, `report_number`, `report_date`, `weather`, `shift`, `site_summary`, `visitors`, `delays_issues`, `actions`, `created_at`, `company_reporting_for`, `creator_name`, `creator_role`, `cover_photo_url`, `signature_url`, `branding_id`, `brand_color`, `brand_logo_url`, `equipment_hire`

**Not on live:** `is_draft`, `shift_type`, `actions_required`, `updated_at`, `user_id`

---

## 3. Primary key

**`id`** (uuid, default `gen_random_uuid()`)

---

## 4. Required / non-null (OpenAPI `required`)

| Column | Notes |
|--------|--------|
| `id` | PK |
| `owner_id` | default `auth.uid()` |
| `project_id` | FK → `projects.id` |
| `report_date` | |
| `created_at` | default `now()` |
| `equipment_hire` | jsonb, NOT NULL — use `[]` if empty |

---

## 5. Owner / user relationship

- **`owner_id` exists** on `daily_reports` (and on labour/plant/photos).
- **`user_id` does not exist** on `daily_reports`.
- Populated by DB default **`auth.uid()`** on insert (OpenAPI default).
- Observed live value on probe row: `e79ef391-4a45-446b-a6ad-b11c34f2b727`.

---

## 6. RLS policies (SELECT / INSERT / UPDATE)

**Exact policy SQL: unavailable** — no `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` in `.env.local`; `pg_policies` not exposed via PostgREST (`LIVE_RLS_PROBE.json`).

**Empirical (anon key):**

| Op | Result |
|----|--------|
| SELECT | Returns rows |
| UPDATE by `id` | Returns updated row (status 200) |
| INSERT | Not exercised in this proof (edit-save must not insert) |

---

## 7. Exact update filter

```js
.from('daily_reports')
.update(payload)       // keys ⊆ live allowlist only
.eq('id', reportId)    // primary key only
.select()
.single()
```

Then verify:

```js
.from('daily_reports').select('*').eq('id', reportId).single()
```

---

## 8. Mismatches

| Area | Live DB | Form state | Save payload (current) |
|------|---------|------------|------------------------|
| Shift | `shift` | `shiftType` | maps → `shift` ✓ |
| Actions | `actions` | `actionsRequired` | maps → `actions` ✓ |
| Summary | `site_summary` | `siteSummary` | `site_summary` ✓ |
| Draft flag | **absent** | n/a | **must not send `is_draft`** (was the bug) |
| Owner | `owner_id` | not in form | not written on UPDATE (default on INSERT) |
| Hire | `equipment_hire` required | equipment rows | array / `[]` ✓ |

Allowlist builder: `lib/live-diary-schema.js` → used by `lib/diary-save.js`.

**Separate leftover risk:** recent-list queries still filter `.eq('is_draft', false)` and catch missing-column errors — that is list/load, not final UPDATE.

---

## 9. Does current correct UPDATE return zero rows?

**No.** With live-only payload keys:

- UPDATE status **200**, returned `data.id` = same report id  
- Not zero rows, not PGRST116  

With `is_draft` in payload: status **400** PGRST204, `data: null` (failed write, not “zero rows”).

---

## 10. Precise root cause of failed persistence

The app UPDATE included **`is_draft: false`**, but live `daily_reports` has **no `is_draft` column**.

PostgREST response:

`PGRST204 — Could not find the 'is_draft' column of 'daily_reports' in the schema cache`

→ entire UPDATE aborted → edited fields never written → reopen showed old data.

Proven in `docs/LIVE_BAD_COLUMN_PROOF.json`.

---

## UPDATE → SELECT proof (this pass)

| | |
|--|--|
| Report id | `949132dc-644d-47a0-8fad-54951a4375fc` |
| Before `site_summary` | `null` |
| UPDATE payload | `{ site_summary: "M0-A-PROBE …" }` |
| UPDATE response id | **same** `949132dc-…` |
| Fresh SELECT `site_summary` | **matched marker** |
| Same id preserved | **yes** |
| Restored after proof | yes (`site_summary` → `null`) |

`docs/LIVE_UPDATE_SELECT_PROOF.json` → `ok: true`

---

## Status

- Live schema reconciled; save contract allowlists live columns only.  
- DB-level persistence proven (UPDATE → SELECT).  
- **No UI changes this pass. No INSERT fallback. M0 not marked passed** until you confirm the in-app Save path persists on reopen.
