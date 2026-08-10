# Zlog Functional Spec V1 — Architecture Audit & Implementation Plan

**Status:** Audit complete — rebuild not started  
**Date:** 2026-08-05  
**Scope:** Grounded in the existing repository. No speculative redesign of working modules. Landing page locked.

---

## 1. Existing system summary

### 1.1 Product shape today

Zlog is a Next.js 16 (App Router) + React 19 + Supabase mobile-first field-reporting app.

| Layer | Reality in repo |
|--------|------------------|
| Framework | Next.js `16.2.6`, React `19.2.4`, Turbopack dev |
| Auth / data | Supabase SSR client (`@supabase/ssr`, `@supabase/supabase-js`) |
| Storage | Private bucket `site-photos` |
| PDF | `@react-pdf/renderer` document exists; **share path is a stub** |
| Signature | `signature_pad` on the Site Diary form |
| Vision / OCR | OpenAI vision via `/api/parse-signin-sheet` and `/api/ai-annotate` |
| Styling | `app/globals.css` tokens + heavy inline styles via `lib/premium-ui.jsx`; fonts Barlow + Space Grotesk |

### 1.2 Current routes

| URL | File | Role |
|-----|------|------|
| `/` | `app/page.tsx` | **Landing — LOCKED** |
| `/login` | `app/(auth)/login/page.jsx` | Email/password → `/dashboard` |
| `/signup` | `app/(auth)/signup/page.jsx` | Creates auth + `companies`/`users` → `/onboarding` (**page missing**) |
| `/dashboard` | `app/dashboard/page.jsx` | Five module cards |
| `/dashboard/diary/setup` | `app/dashboard/diary/setup/page.jsx` | Site Diary identity setup → draft |
| `/dashboard/project/[id]` | `app/dashboard/project/[id]/page.jsx` | Project hub (diary + snags) |
| `/dashboard/project/[id]/diary` | `…/diary/page.jsx` | Site Diary start screen + full form |
| `/dashboard/project/[id]/diary/complete` | `…/diary/complete/page.jsx` | Post-save complete / share stub |
| `/dashboard/project/[id]/snags` | `…/snags/page.jsx` | Snag list |
| `/dashboard/project/[id]/site-survey` | `…/site-survey/page.jsx` | Thin wrapper → `SimpleBrandedReportPage` |
| `/dashboard/project/[id]/weekly-report` | `…/weekly-report/page.jsx` | Progress report (same pattern) |
| `/dashboard/project/[id]/weekly-hs` | `…/weekly-hs/page.jsx` | H&S report (same pattern) |
| `/dashboard/new-project` | `app/dashboard/new-project/page.jsx` | Create project |
| `/dashboard/settings/branding` | `…/settings/branding/page.jsx` | Company branding profiles |
| `POST /api/parse-signin-sheet` | `app/api/parse-signin-sheet/route.js` | Sign-in register OCR |
| `POST /api/ai-annotate` | `app/api/ai-annotate/route.js` | Photo description / annotation assist |
| `POST /api/describe-photo` | `app/api/describe-photo/route.js` | Legacy alias of ai-annotate |

**Middleware note:** Auth guard logic exists in `lib/supabase/middleware.js`, but there is **no root `middleware.js`/`middleware.ts`** wiring it into Next.js. Dashboard protection may be incomplete depending on how the app is deployed.

**Missing routes referenced by code:** `/onboarding`, bare `/projects`, bare `/settings`.

### 1.3 Dashboard (do not redesign yet)

Source: `lib/report-theme.js` → `REPORT_THEME_LIST`, rendered by `app/dashboard/page.jsx` via `ModuleHomeCard`.

| Order | Current title | Target title (product) | Current entry |
|-------|---------------|------------------------|---------------|
| 1 | Site Survey Report | Site Survey | `/dashboard/project/{id}/site-survey` |
| 2 | Site Diary Report | **Today’s Report** | `/dashboard/diary/setup` (always; no project gate) |
| 3 | Site Progress Report | Site Progress | `/dashboard/project/{id}/weekly-report` |
| 4 | Site Snag List | Site Snag List | `/dashboard/project/{id}/snags` |
| 5 | Site H&S Report | Site H&S Report | `/dashboard/project/{id}/weekly-hs` |

Non-diary cards disable until a latest project exists. Top bar (`DashboardTopBar`) is brand + sign-out only.

### 1.4 Current Site Diary / “Today’s Report” implementation

**User-facing title today:** “Site Diary” / “Site Diary Report” / “Site Diary Setup”.

**Flow:**

```
Dashboard → /dashboard/diary/setup
  → createDiaryDraftFromSetup (or updateDiarySetupFields)
  → /dashboard/project/{projectId}/diary?report={reportId}
  → handleSave (UPDATE daily_reports, is_draft=false)
  → /dashboard/project/{projectId}/diary/complete?report={reportId}
  → Dashboard
```

**Alternate entry:** Project hub → `/dashboard/project/{id}/diary` start screen (Continue draft / Create today’s / Blank / template).

**Form section order today** (`app/dashboard/project/[id]/diary/page.jsx`):

1. Branding selector  
2. Project  
3. Author & cover (**signature lives here**)  
4. Report details (date, weather, shift: Day / Night / Weekend / Half day)  
5. Site summary  
6. Labour (manual + sign-in OCR)  
7. Plant  
8. Equipment on hire  
9. Visitors  
10. Delays & issues  
11. Actions required  
12. Work Photos (`AiLocationWalk` — area groups + photos + captions + annotations)  
13. Save CTA → Complete screen  

**Absent vs locked product sequence:** Deliveries, Permits (client vs contractor), Daily Site Checks (housekeeping, welfare, scaffolding, asbestos, lifting, etc.), structured Issues & Observations categories, declaration-as-final-step, live PDF generate/share, “Back” shift option.

### 1.5 Components worth preserving

| Area | Paths | Preserve? |
|------|-------|-----------|
| Premium UI kit | `lib/premium-ui.jsx` | Yes — evolve, don’t replace |
| Report themes | `lib/report-theme.js` | Yes — rename diary → Today’s Report carefully |
| Branding | `components/branding/BrandingSelector.jsx`, settings page | Yes (Sticky) |
| Sign-in OCR | `lib/parse-signin-sheet.js`, `lib/labour-from-register.js`, `SignInOperativeReview.jsx`, API route | Yes — map into Site Attendance |
| Area / photo evidence | `components/ai-annotation/*`, `lib/ai-annotation/*`, `components/photo-annotations/*` | Yes — becomes Work Undertaken & Evidence |
| Image capture | `components/ImageSourceButtons.jsx` | Yes |
| PDF document | `components/pdf/DiaryPdfDocument.jsx`, `PdfHeader.jsx` | Yes — wire to share; extend sections |
| Simple branded reports | `components/reports/SimpleBrandedReportPage.jsx` | Yes for Survey / Progress / H&S until those modules are rebuilt |
| Snags page | `app/dashboard/project/[id]/snags/page.jsx` | Yes — out of Today’s Report V1 scope except cross-links later |
| Landing | `app/page.tsx`, `app/landing-feature-strip.tsx` | **Locked** |
| Design rulebook | `DESIGN.md` | Authority for visual DNA |

### 1.6 Supabase tables (from migrations)

| Table | Role |
|-------|------|
| `projects` | Project identity (owner-scoped RLS assumed) |
| `daily_reports` | Diary / draft / saved daily report |
| `report_labour` | Attendance / labour rows |
| `report_plant` | Plant rows |
| `report_photos` | Photos + layout + location + annotations + overlay |
| `company_brandings` | Sticky company branding profiles |
| `snags` | Snag module |
| `site_survey_reports` / `weekly_progress_reports` / `weekly_hs_reports` | Other modules (summary + jsonb photos) |
| `site_sign_ins` | Migrated; **unused by app JS** |
| `companies` / `users` | Signup only (no create migration in repo) |
| Storage `site-photos` | Covers, signatures, photos, overlays, logos |

**Draft flag:** `daily_reports.is_draft` (migration `20260728010000`).

### 1.7 Save / create / update / report ID handling

| Step | Behaviour |
|------|-----------|
| Report ID | UUID from draft insert; carried in `?report=` (or `?diaryId=`) |
| Edit mode | `editingReportId` from search params; form only shown when set |
| Save | `handleSave` in diary `page.jsx`: UPDATE by id+project_id, set `is_draft: false` |
| Labour / plant | Delete-all then insert on update |
| Photos | Reconcile: delete removed, update kept, insert new |
| Complete | Client navigate after ~1.5s; **no second write** |
| Share | `lib/diary-share.js` stub — does not generate PDF yet |
| Setup extras | `projectReference` in **sessionStorage** (`lib/report-setup.js`), not DB |

### 1.8 OCR / sign-in flow

1. User picks camera/upload in Labour section.  
2. Client normalises image (`fileToVisionDataUrl`).  
3. `POST /api/parse-signin-sheet` with `reportDate`, `groupBy`.  
4. Vision model returns rows; hours computed from in/out (not AI).  
5. `SignInOperativeReview` allows correction.  
6. Apply → labour summary rows → saved with report.

Known risk areas (do not fix in this audit): wrong date filter, wrong operative match, camera remount / loading stuck.

### 1.9 Signature

- Canvas in **Author & cover** via `signature_pad`.  
- Modes: draw / carried / accepted.  
- On save: upload PNG → `daily_reports.signature_url`.  
- PDF has a declaration + signature page in `DiaryPdfDocument` — not connected to Share yet.

### 1.10 PDF / report generation

- `DiaryPdfDocument` builds multi-page PDF structure (summary, photo grids, declaration).  
- Complete screen Share button calls stub → “PDF generation coming next.”  
- **First high-value gap:** wire `pdf()` / blob / Web Share or download without redesigning the document model.

### 1.11 Styling architecture

- Tokens: `app/globals.css` (`--ink`, `--text`, `--action`, `--plate`, `--edge`, …).  
- Kit: `lib/premium-ui.jsx` (`PrimaryCTA`, `GlassSection`, `ModuleHomeCard`, type tokens).  
- Module accents: `lib/report-theme.js` (diary violet locked in design system).  
- `DESIGN.md`: industrial powder-coat language; notes that much styling still lives inline.  
- Product direction for Today’s Report: **calmer, less decorative** than the industrial dashboard — evolve section chrome, do not invent a second design system.

---

## 2. Target architecture

### 2.1 Product principles (approved)

- Capture once. Reuse everywhere.  
- Site professional’s job is running the project, not feeding software.  
- Mobile-first: large targets, strong contrast, legible type.  
- Voice as input later; V1 stays simple and reliable.  
- **No AI terminology in the UI.**  
- Dashboard → industrial Site Control Panel (later).  
- Report-entry → progressively calmer.  
- Landing page locked.

### 2.2 Today’s Report — locked sequence

| Step | Section | Maps from today |
|------|---------|-----------------|
| **A** | Report Identity | Setup page + Branding + Author & cover + Project + Report details (partial) |
| **B** | Site Attendance | Labour + sign-in OCR + `SignInOperativeReview` |
| **C** | Site Resources | Visitors, Plant, Equipment on hire; **add** Deliveries, Permits |
| **D** | Daily Site Checks | **New** structured checks |
| **E** | Work Undertaken & Evidence | `AiLocationWalk` area model + photos/annotations; **add** activity notes, docs, permit/delivery links |
| **F** | Issues & Observations | Delays & issues + Actions; **restructure** categories; no silent carry of daily issues |
| **G** | Complete Report | Signature move here + validation + preview + PDF + share + dashboard / another report |

### 2.3 Capture-once model

```
Sticky profile / project ──► Report Identity (A)
Semi-sticky resources ─────► Site Resources (C) [review on continue]
Daily capture ─────────────► B, D, E, F (never silent-copy as “today”)
Live registers ────────────► referenced from F / C (RFI, variation, permit, TW, actions)
Daily report row ──────────► snapshot + foreign keys / links — not a full register dump
```

---

## 3. Route proposal

**Principle:** Prefer additive routes and renames behind feature flags or title-only changes first. Do not delete working diary URLs until redirects exist.

| Proposed URL | Purpose | Notes |
|--------------|---------|-------|
| `/` | Landing | **Unchanged** |
| `/dashboard` | Site Control Panel (later visual) | Keep five modules; rename diary card to “Today’s Report” |
| `/dashboard/today` or `/dashboard/todays-report/setup` | Report Identity (A) | Evolve from `/dashboard/diary/setup` |
| `/dashboard/project/[id]/today` or keep `/diary` | Report workspace B–F | Evolve from diary page; calm chrome |
| `/dashboard/project/[id]/today/complete` | Complete (G) | Evolve from diary complete |
| Existing survey / progress / snags / H&S paths | Unchanged in V1 rebuild of Today’s Report | |

**Redirects (when renaming):**

- `/dashboard/diary/setup` → new setup path  
- `/dashboard/project/[id]/diary` → new today path (preserve `?report=` / `?diaryId=`)  
- `/dashboard/project/[id]/diary/complete` → new complete path  

**Recommendation:** Keep `/diary` paths as aliases through Phase 2 to avoid breaking saved bookmarks and in-flight drafts.

---

## 4. Component proposal

### 4.1 Preserve and adapt

| Component / lib | Future home |
|-----------------|-------------|
| Setup form fields | `ReportIdentity` (A) |
| `BrandingSelector` | A — sticky branding |
| `SignInOperativeReview` + parse libs | `SiteAttendance` (B) |
| Plant / equipment hire UI | `SiteResources` (C) |
| `AiLocationWalk` + area-groups | `WorkUndertakenEvidence` (E) |
| `PhotoAnnotationEditor` | E — optional annotated images |
| Signature pad block | Move to `CompleteReport` (G) |
| `DiaryPdfDocument` | G — extend for checks / permits / issues |
| `PrimaryCTA` / `GlassSection` | Shared; calm variants for report workspace |

### 4.2 New (Today’s Report V1)

| Component | Section |
|-----------|---------|
| `ShiftSelector` | A — Day / Back / Night (replace Weekend / Half day when product confirms) |
| `DeliveriesPanel` | C |
| `PermitsPanel` | C — client/PC vs contractor activity types |
| `DailySiteChecks` | D — modular check groups |
| `IssuesObservations` | F — typed matter categories |
| `ReportValidationSummary` | G |
| `ReportPreview` | G |
| `ShareReport` (real) | G — replace stub |

### 4.3 UI language

- User-facing module title: **Today’s Report** (not Site Diary).  
- Never expose “AI”, model names, or “OCR” in labels; prefer “Scan register”, “Describe photo”, “Extract attendance”.  
- Existing `useSpeechDictation` may support notes later; V1 can keep typed notes first.

---

## 5. Data-model proposal

### 5.1 Keep as the daily report spine

`daily_reports` remains the primary row for Today’s Report (optionally rename in UI only; DB rename is optional and risky).

Suggested additive columns / JSON (prefer JSONB modules early to move fast, normalise later where queried):

| Concern | Proposal |
|---------|----------|
| Contract reference | Column on `daily_reports` or `projects` (today only in sessionStorage) |
| Shift | Align to product: Day / Back / Night; fix code↔DB column name |
| Deliveries | `deliveries jsonb` or `report_deliveries` table |
| Permits (snapshot + links) | `report_permits` + optional `project_permits` live register |
| Daily checks | `daily_checks jsonb` keyed by check module |
| Work areas | Prefer structured `report_work_areas` + photos FK `work_area_id` (today: `report_photos.location` string only) |
| Issues | `report_issues` typed rows (delay, safety, instruction, commercial, RFI, variation, other) |
| Declaration | `declared_at`, keep `signature_url` |
| Sticky author defaults | User/profile or last-saved sticky fields (already partially via draft helpers) |

### 5.2 Live registers (separate from daily report)

New tables over time (not all required on day one):

- `project_rfis`  
- `project_variations`  
- `project_permits`  
- `project_temporary_works`  
- `project_actions`  

Daily report rows **reference** register IDs and may create/update a register entry from an issue raised today — they must not embed the full register.

### 5.3 Child tables to retain

- `report_labour` → Site Attendance (possibly rename conceptually; keep table initially).  
- `report_plant` → Site Resources.  
- `report_photos` → Evidence under work areas (add `work_area_id` when areas are first-class).  
- `equipment_hire` jsonb → Semi-sticky resources (or split table later).

---

## 6. Sticky / Daily / Semi-sticky / Live Register classification

### 6.1 STICKY (reuse across reports)

| Field | Current storage |
|-------|-----------------|
| Reporting company / branding | `company_brandings` + report branding cols |
| Company logo | `brand_logo_url` / branding profile |
| Author name / role | `creator_name`, `creator_role` (also setup) |
| Project | `projects` / `project_id` |
| Reporting on behalf of | `company_reporting_for` |
| Job / contract reference | sessionStorage only today → must become durable |
| **Project Start Date** (planned) | Project-level — entered once; **not** per daily report |
| **Planned Completion Date** (planned) | Project-level — entered once; **not** per daily report |
| **Project Day** (planned) | **Automatically calculated** from Start + Planned Completion (e.g. `Project Day 17 of 50`); no daily input |

**Carry-forward rule:** Safe to prefill from last saved / profile. User may edit entered sticky fields.

**Project Day (approved planned feature):** Derived display of elapsed programme time only — never % physical complete or “on programme”. See `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`. Calendar vs working days must be resolved before implementation. Do not add to current Site Diary UI yet.

### 6.2 DAILY (fresh each report — never silent-copy as current facts)

| Field | Current |
|-------|---------|
| Report date | `report_date` |
| Shift | `shift` / `shift_type` |
| Weather | `weather` |
| Attendance / labour | `report_labour` |
| Visitors | `visitors` |
| Site summary / work notes | `site_summary` + future area notes |
| Daily checks | **missing** |
| Deliveries (for the day) | **missing** as structured |
| Issues / delays / actions raised today | `delays_issues`, `actions` / `actions_required` |
| Photos / evidence for today | `report_photos` |
| Signature / declaration for today | `signature_url` |

**Continue previous report:** Do **not** copy these as if still true. Blank or explicit “review” empty state.

### 6.3 SEMI-STICKY (may carry forward; must be reviewed)

| Field | Current |
|-------|---------|
| Plant and equipment | `report_plant` |
| Equipment on hire | `equipment_hire` jsonb |
| Active permits (where appropriate) | **missing** |
| Continuing site resources | partial |

**Continue previous report:** Prefill with clear “Review — still on site?” UX; require acknowledgement or edit before save in later phases.

### 6.4 LIVE REGISTER (persistent project records)

| Register | Current |
|----------|---------|
| RFIs | Mentioned in placeholders only |
| Variations | Missing |
| Permits | Missing |
| Temporary Works | Missing |
| Actions | Free-text `actions` only |
| Snags | Separate module (`snags`) — already a live-ish list |

---

## 7. Migration requirements

### 7.1 Critical: align live schema with code (or code with migrations)

Migrations define:

- `shift_type`, `actions_required`  
- labour `headcount`, `sort_order`  
- plant `plant_type`, `quantity`, `hours`, `sort_order`  
- photos `storage_path`, `sequence_number`  

Application code writes:

- `shift`, `actions`  
- labour `count`, `sequence`  
- plant `item`, `ref`, `status`, `sequence`  
- photos `url`, `sequence`  

Load paths often accept **both** names. **Risk:** environments that only applied repo migrations will fail writes; environments that were altered manually will diverge from migrations.

**Required first data task:** Inspect live Supabase schema; produce a single reconciliation migration (rename columns **or** update code to migration names). Do not guess — verify production/dev columns.

### 7.2 Likely additive migrations (Today’s Report V1+)

1. Durable `contract_reference` (project and/or report).  
2. `daily_checks jsonb` (or normalised check tables).  
3. `deliveries` structure.  
4. `report_permits` + permit type enum / check constraints.  
5. `report_work_areas` + `report_photos.work_area_id`.  
6. `report_issues` with `issue_type`.  
7. Shift constraint / values: Day, Back, Night.  
8. `declared_at` / completion metadata.  
9. Optional live register tables (phased).  
10. Wire root Next.js `middleware.ts` to existing Supabase helper.

### 7.3 Unused / orphan

- `site_sign_ins` table unused — either wire as LIVE REGISTER for attendance history or leave dormant; do not delete without product decision.

---

## 8. Safe implementation phases

### Phase 0 — Stabilise foundation (no product redesign)

1. Reconcile DB column names vs code (verified against live DB).  
2. Confirm one authoritative save path: update-by-id when `?report=` present; never insert a second saved row for the same edit session.  
3. Setup: avoid duplicate drafts (reuse open draft per project when appropriate).  
4. Wire PDF generate/download in complete flow (use existing `DiaryPdfDocument`).  
5. Add root `middleware.ts` if auth guard is required.  
6. Fix `/onboarding` dead link from signup (minimal page or redirect to dashboard).  

**Do not** redesign dashboard or landing.

### Phase 1 — Rename & sequence shell (Today’s Report)

1. User-facing copy: Site Diary → **Today’s Report**.  
2. Reorder UI into A→G sections (can still be one scrollable page).  
3. Move signature + declaration into G.  
4. Shift options → Day / Back / Night (migrate stored values carefully).  
5. Keep existing save/update and draft IDs.

### Phase 2 — Expand data capture

1. Deliveries + Permits (C).  
2. Daily Site Checks modules (D) — start with core checks; scaffold asbestos/lifting as optional.  
3. Restructure Issues & Observations (F).  
4. Persist contract reference.  
5. Work area notes / activity fields on area groups (E).

### Phase 3 — Continue previous report (rules-compliant)

1. Explicit **Continue** vs **Start new**.  
2. Carry sticky + reviewed semi-sticky only.  
3. Never silent-copy daily issues, attendance, weather, date-specific facts.

### Phase 4 — Live registers

1. RFI / variation / permit / TW / actions tables.  
2. Daily report links into registers.  
3. Dashboard control-panel surfaces (read-only counts later).

### Phase 5 — Dashboard industrial control panel

Visual evolution of `/dashboard` only after Today’s Report sequence is stable. Landing remains locked.

---

## 9. Existing functionality that must be preserved

- Landing page (`app/page.tsx` + feature strip) — **locked**.  
- Auth login/signup (fix signup destination).  
- Five dashboard modules and their entry points (titles may change for diary only).  
- Draft create / continue / template patterns that do not mutate source reports (`lib/diary-draft.js`).  
- Branding profiles and per-report branding snapshot.  
- Sign-in scan → review → labour apply.  
- Area-grouped photos, captions, layouts, annotation overlays.  
- Cover photo + signature storage on the report.  
- Save → complete screen handoff (improve reliability; don’t remove).  
- Snags, Survey, Progress, H&S modules as currently usable.  
- `DESIGN.md` visual DNA (adapt calm report chrome without a second brand).  
- Existing report IDs and stored photos for already-saved diaries.

---

## 10. Known technical risks

| Risk | Detail |
|------|--------|
| **Schema drift** | Code column names ≠ migration column names |
| **Duplicate drafts** | Setup / Create today / template always INSERT; no unique open-draft constraint |
| **Duplicate saved rows** | Historical INSERT-without-id path; form GET remount races (partially addressed in diary save UX) |
| **Save confirmation** | Completion timer / remount / double-binding historically flaky |
| **Signature regression** | Touch/pointer issues reported on Android |
| **Camera / loading** | Remount mid-capture can stick on Loading |
| **OCR date / operative** | Wrong day or person selection |
| **PDF not wired** | Document exists; share stub only |
| **sessionStorage contract ref** | Lost across devices / cleared sessions |
| **Middleware not mounted** | `lib/supabase/middleware.js` unused without root middleware file |
| **Missing `/onboarding`** | Signup navigates to nonexistent route |
| **Labour/plant wipe on save** | Delete-all + insert — safe if save completes; partial failure can drop child rows after parent update |
| **Photo storage orphans** | DB delete without storage delete (and reverse) |
| **AI UI leakage** | Component names (`AiLocationWalk`) must not become user-visible labels |
| **Data loss on “continue”** | If continue copies daily fields, product rule is violated |

---

## 11. Gap analysis — preserve vs refactor

| Area | Preserve | Refactor / extend |
|------|----------|-------------------|
| Landing | Full preserve | None |
| Dashboard grid | Structure + five modules | Title diary → Today’s Report; industrial panel later |
| Diary setup | Field capture | Become Report Identity (A); persist contract ref |
| Diary form | Save path, OCR, photos, branding | Reorder A–G; add C/D/F depth; calm UI |
| Complete | Route + CTAs | Real PDF; validation; declaration |
| Draft helpers | Reusable vs cleared field split | Encode sticky / semi-sticky / daily rules explicitly |
| Other report modules | Keep SimpleBrandedReportPage | Out of scope for Today’s Report V1 rebuild |
| DB | Existing rows | Reconcile names; additive migrations |

---

## 12. Recommended first coding milestone

**Milestone M0 — Schema reconciliation + save-path contract (no UI redesign)**

**Status: save contract implemented on `architecture-rebuild`; bug M0-01 (login autofill auto-submit) RESOLVED and included in M0.** See `docs/M0_SAVE_LIFECYCLE.md`.

Delivered:
1. Authoritative UPDATE-only final save in `lib/diary-save.js` (`finalizeSiteDiarySave`).
2. Form `handleSave` never inserts `daily_reports`; missing `?report=` fails loudly.
3. Structured logging (`[zlog:diary-save]`), Saving… / ✓ Saved confirmation, complete navigation with same id.
4. Legacy column retry for `shift`/`actions` (and labour/plant) when live DB still uses migration names.
5. **M0-01:** Login no longer auto-submits on autofill; Sign In is explicit click/Enter only (`app/(auth)/login/page.jsx` + regression test).

Remaining for M0 acceptance:
- Authenticated browser save checklist (edit → save → refresh → same id, no duplicate).
- Optional: draft `owner_id` on create (separate from UPDATE contract).

Remaining follow-ups (not blocking M0 acceptance if live columns already match app writes):
- Optional dedicated reconciliation migration once live schema is confirmed.
- Setup duplicate-draft policy (Phase 0 item 3) — separate from final-save contract.

---

## 13. Questions that cannot be resolved from the repository alone

1. **Live database column names** — Are production/dev columns the migration names (`shift_type`, `headcount`, `storage_path`, …) or the code names (`shift`, `count`, `url`, …)?  
2. **Shift product values** — Confirm replacement of Weekend / Half day with **Back**; any migration of historical values?  
3. **Draft policy** — One open draft per project, or allow many?  
4. **Continue previous report** — Prefill semi-sticky plant/hire automatically with mandatory review, or opt-in “Copy resources”?  
5. **Permits / checks V1 depth** — Full checklist in first release, or scaffold core checks only?  
6. **Contract reference** — Belongs on `projects`, on each `daily_reports`, or both?  
7. **Auth middleware** — Should root `middleware.ts` be enabled immediately?  
8. **Signup `/onboarding`** — Intended product step, or redirect to dashboard?  
9. **`site_sign_ins` table** — Future live attendance register, or obsolete?  
10. **PDF sharing** — Download only for V1, or Web Share API + email?

---

## 14. Files inspected (audit)

### App routes / pages
- `app/page.tsx`, `app/landing-feature-strip.tsx`, `app/layout.tsx`, `app/globals.css`
- `app/(auth)/login/page.jsx`, `app/(auth)/signup/page.jsx`
- `app/dashboard/page.jsx`, `app/dashboard/new-project/page.jsx`
- `app/dashboard/diary/setup/page.jsx`
- `app/dashboard/settings/branding/page.jsx`
- `app/dashboard/project/[id]/page.jsx`
- `app/dashboard/project/[id]/diary/page.jsx`
- `app/dashboard/project/[id]/diary/complete/page.jsx`
- `app/dashboard/project/[id]/snags/page.jsx`
- `app/dashboard/project/[id]/site-survey/page.jsx`
- `app/dashboard/project/[id]/weekly-report/page.jsx`
- `app/dashboard/project/[id]/weekly-hs/page.jsx`
- `app/api/parse-signin-sheet/route.js`, `app/api/ai-annotate/route.js`, `app/api/describe-photo/route.js`

### Libs
- `lib/report-theme.js`, `lib/premium-ui.jsx`, `lib/diary-draft.js`, `lib/report-setup.js`, `lib/diary-share.js`
- `lib/parse-signin-sheet.js`, `lib/labour-from-register.js`
- `lib/ai-annotation/*`, `lib/photo-annotations/*`
- `lib/supabase/middleware.js`, `lib/supabase/client` (pattern)

### Components
- `components/branding/BrandingSelector.jsx`
- `components/diary/SignInOperativeReview.jsx`
- `components/ai-annotation/*`, `components/photo-annotations/*`
- `components/pdf/DiaryPdfDocument.jsx`, `components/pdf/PdfHeader.jsx`
- `components/reports/SimpleBrandedReportPage.jsx`
- `components/dashboard/DashboardTopBar.jsx`
- `components/ImageSourceButtons.jsx`

### Data / design
- All `supabase/migrations/*.sql` (9 files)
- `DESIGN.md`, `package.json`

---

## 15. Summary for stakeholders

| Topic | Finding |
|-------|---------|
| **Current architecture** | Next.js App Router + Supabase; five report modules; Site Diary is the deepest module (setup → draft → form → complete stub) |
| **Main technical debt** | Schema/code column drift; duplicate drafts; PDF share stub; middleware not mounted; session-only contract ref; monolith diary page; missing product sections (checks, permits, deliveries, typed issues) |
| **Migration sequence** | (0) Reconcile columns → (1) Rename/sequence Today’s Report UI → (2) Add C/D/F data → (3) Continue-report rules → (4) Live registers → (5) Dashboard panel |
| **First coding task** | Live schema verification + reconciliation so `?report=` UPDATE is reliable |
| **Do not touch yet** | Landing page; broad dashboard redesign; speculative deletion of working diary/OCR/photo paths |
| **Future premium (documented only)** | Project Day; Progress Report programme / Gantt; Progress Date Line; Mark Up Programme — see §16 |

---

## 16. Future Progress Report — Project Programme (approved; not implementing)

**Recorded:** 2026-08-06 · **No production code in this section.**

**Approved product decision:**

> The Progress Report will eventually allow a project programme or Gantt chart to be uploaded once, reused in weekly reports, marked with a progress date line and annotated to show completed, ongoing and delayed work. The original programme must remain unchanged.

### Requirements summary

| Area | Requirement |
|------|-------------|
| Project Start Date | Project-level; entered once; not re-entered daily |
| Planned Completion Date | Project-level; entered once; not re-entered daily |
| **Project Day** | **Approved planned feature.** Calculated **automatically** from start + planned completion (e.g. `Project Day 17 of 50`). Elapsed programme time only — **not** physical % complete. No daily input. |
| Planned Days Remaining | Derived automatically alongside Project Day |
| Site Diary | May later display automatic Project Day — **not in current Site Diary** |
| Programme upload | Once per project (PDF / image / TBD); reuse weekly; re-upload only on revised programme |
| Weekly markup | Progress Date Line / Progress Drop-Line; Mark Up Programme; non-destructive weekly versions |
| Status colours | Green Complete · Amber In Progress · Red Delayed / At Risk (status only) |
| PDF | Distinguish planned programme, reported actual progress, and author annotations |

### Boundary

- **Not** part of Shared Photo Workspace (P2).  
- **Do not** add Project Day to the current Site Diary yet.  
- **Do not** schedule or implement phases PR1–PR8 until explicitly approved.  

### Canonical docs

| Doc | Role |
|-----|------|
| `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md` | Full architecture & phases PR1–PR8 |
| `docs/PRODUCT_ROADMAP.md` | Roadmap placement |
| `docs/PREMIUM_FEATURE_BACKLOG.md` | Backlog IDs PR-BL-01…10 |
| `docs/PROTECTED_PRODUCT_DECISIONS.md` | Protected decision + regression contract |

---

*End of audit. Rebuild begins only after this plan is accepted and M0 questions (especially live schema) are answered.*
