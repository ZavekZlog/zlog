# M0 — Site Diary save lifecycle & contract

**Branch:** `architecture-rebuild`  
**Status:** PASSED — persistence verified (manual 2026-08-05). M0-01, M0-02, and M0-A passed. Entry hub at `/dashboard/diary` preserved.  
**Scope:** Stabilise final save only. No UI redesign, no Site Diary rename, no route changes.

---

## 0. Bug fixes included in M0

### M0-01 — Login autofill auto-submit — **RESOLVED** (manual PASS)

| | |
|--|--|
| **Symptom** | Credentials autofill / entry triggered automatic `signInWithPassword` |
| **Root cause** | Sign In was `type="submit"` with `onSubmit` → auth; password managers synthesise form submit after fill |
| **Fix** | `app/(auth)/login/page.jsx`: submit only `preventDefault`; Sign In `type="button"` + click; Enter via `onKeyDown` |
| **Regression test** | Kept: `lib/auth/login-form.test.js` → `BUG M0-01 — no autofill auto-submit contract` |
| **Manual verification** | Desktop browser + phone incognito — PASS (2026-08-05) |

### M0-02 — Save Changes missing Saving… / ✓ Saved — **PASSED** (manual 2026-08-05)

| | |
|--|--|
| **Symptom** | After sign-in + edit + Save, no visible Saving… or ✓ Saved |
| **Likely causes** | (1) Validation/auth failed before paint; (2) silent early-return on lock; (3) error banner only at top of long form; (4) Saved hold was 1.5s then navigate |
| **Fix** | `flushSync` set Saving… **before** validation/async; failure message also beside Save CTA; ✓ Saved held **2s** before navigate; `[zlog:diary-save]` logs gated to non-production |
| **Manual verification** | Saving… then ✓ Saved (≥2s) before navigate — PASS (2026-08-05) |

### M0-A — Data did not persist — **PASSED** (manual 2026-08-05)

| | |
|--|--|
| **Root cause** | Live `daily_reports` has **no** `is_draft`. App UPDATE included `is_draft: false` → PostgREST **PGRST204** → entire UPDATE aborted → edits never persisted |
| **Proof** | `docs/LIVE_BAD_COLUMN_PROOF.json` (fail) + `docs/LIVE_UPDATE_SELECT_PROOF.json` (success with live columns only) |
| **Live schema** | `docs/LIVE_SCHEMA_RECONCILIATION.md` + `docs/LIVE_SCHEMA_DAILY_REPORTS.json` |
| **Fix** | `lib/live-diary-schema.js` allowlist; `finalizeSiteDiarySave` builds payload from live columns only; UPDATE by `id` then fresh SELECT verify |
| **Manual verification** | Edit → Save → reopen same id — edits persist — PASS (2026-08-05). Entry hub `/dashboard/diary` preserved. |

---

## 1. Authoritative save contract

| Concern | Rule |
|--------|------|
| **Final save** | `lib/diary-save.js` → `finalizeSiteDiarySave` |
| **daily_reports write** | **UPDATE only** by `id` + `project_id` |
| **INSERT into daily_reports** | **Forbidden** on Save. Drafts are created earlier via `lib/diary-draft.js` / setup |
| **Report id** | Required (`?report=` or `?diaryId=`). Missing id → error, no new row |
| **UI entry** | Single handler `handleSave` in `app/dashboard/project/[id]/diary/page.jsx` |
| **Button** | `type="button"` + form `onSubmit` with `preventDefault` (no native GET remount) |

Draft / template / setup creates remain in `lib/diary-draft.js`. They are **not** the final-save path.

---

## 2. Complete lifecycle

```
User presses Save Changes (or Enter in form)
        │
        ▼
handleSave (page)
  • preventDefault / stopPropagation
  • block if saveLock | justSaved | completing
  • flushSync setSaving(true) → button shows "Saving..." IMMEDIATELY
  • REQUIRE editingReportId  ──missing──► failSave (error beside CTA)
  • validate site summary / photo descriptions → failSave on fail
        │
        ▼
Auth + optional cover/signature storage uploads
        │
        ▼
Build reportPayload, labourPayload, plantPayload, photo ops
        │
        ▼
finalizeSiteDiarySave (lib/diary-save.js)
  • log start (mode: update)
  • UPDATE daily_reports  (retry legacy shift_type / actions_required if needed)
  • assert returned id === editingReportId
  • DELETE+INSERT report_labour / report_plant
  • reconcile report_photos (delete removed, update kept, insert new)
  • log success | throw DiarySaveError on failure
        │
        ├── failure ──► failSave → unlock → error beside CTA → retry allowed
        │
        ▼ success
flushSync setJustSaved(true), setSuccess('Saved')
button → "✓ Saved" (green)
log success state set
        │
        ▼ after 2000ms (user must see confirmation first)
router.replace(.../diary/complete?report={SAME_ID})
log ui:navigate
```

Refresh / reopen `?report={SAME_ID}` loads the updated row. No second `daily_reports` insert.

---

## 3. Logging (browser console)

Filter: `[zlog:diary-save]`

| Stage | Meaning |
|-------|---------|
| `save button clicked` | PrimaryCTA / form fired handleSave |
| `save handler entered` | Passed lock guards |
| `saving state set` | flushSync Saving… painted |
| `validation result` | Client validation ok / reason |
| `auth check` | Supabase getUser result |
| `update started` | About to call finalizeSiteDiarySave |
| `supabase response` | Returned saved row |
| `success state set` | ✓ Saved painted (2s hold) |
| `error state set` | failSave path |
| `ui:navigate` | Leaving for complete screen |
| `ui:uncaught` | Unexpected throw |

Also contract logs from `lib/diary-save.js` (`start`, `update:*`, `success`, etc.).

---

## 4. Visible confirmation

| State | UI |
|-------|-----|
| Saving | Button disabled, spinner, label **Saving...** (set via `flushSync` before validation/async) |
| Saved | Button disabled, green style, label **✓ Saved** + status next to CTA; held **≥2s** before navigate |
| Failure | Button restored; red error **next to Save CTA** (and top banner if present); retry allowed |

Existing complete route is unchanged. **M0 passed** (manual 2026-08-05): Saving… / ✓ Saved visible; persistence verified; entry hub `/dashboard/diary` preserved.

---

## 5. Acceptance checklist

### M0-01 Login (included in milestone)
- [x] Autofill does not auto-submit — **PASSED** manual (desktop + phone incognito)
- [x] Regression test retained: `lib/auth/login-form.test.js`

### Authenticated save — **PASSED** (manual 2026-08-05)
- [x] Open existing report via View / Edit (`?report={id}`)
- [x] Note the report id in the URL
- [x] Edit site summary (or another field)
- [x] Press **Save Changes**
- [x] See **Saving...** immediately (button disabled)
- [x] See **✓ Saved** for at least 2 seconds before navigation
- [x] Land on Report Complete with the **same** `report=` id
- [x] Return and reopen the same id — edits persist
- [x] Recent list does **not** gain an extra card for that save
- [x] Console shows `[zlog:diary-save]` click → saving → update → success (and **no** daily_reports insert)
- [x] Entry hub at `/dashboard/diary` preserved

### Known verification notes
- Automation browser may show dashboard **Sign out** without a live Supabase session (top bar always renders Sign out). Save correctly enters session-expired recovery (**Sign in to Save**) until an explicit Sign In in that browser.
- **Create Today’s Diary** currently errors: `null value in column "owner_id" of relation "daily_reports"` — draft insert does not set `owner_id`. Track separately from final-save UPDATE contract; does not block edit-save once authenticated.

---

## 6. Out of scope (later milestones)

- Renaming Site Diary → Today’s Report  
- Route changes  
- Dashboard redesign  
- Full schema normalisation migration (partial legacy retry only)  
- PDF share implementation  
- Duplicate-draft policy on setup Continue  
