# Zlog Product Backlog

**Master issue tracker for product work**  
**Version:** 1.0.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Initial living backlog for commercial change control  
**User Decision:** Final governance pass — change control and product backlog  
**Previous Version:** none  

Zlog is a commercial software product. Track work here. Do not invent issues. Seed only user-confirmed items.

Categories (use one per issue): Site Diary · Site Progress Report · Survey Report · Snag List · Dashboard · Project Model · Photo Workspace · OCR · Annotation · Branding · Authentication · Performance · Mobile UX

Statuses: `Open` · `Approved` · `In Progress` · `Blocked` · `Frozen` · `Closed`

Priorities: `P0` · `P1` · `P2` · `P3`

Related: `docs/ZLOG_PRODUCT_CONSTITUTION.md`, `docs/contracts/PENDING_APPROVAL_GAPS.md`, `docs/contracts/README.md`, `.cursor/rules/commercial-product-governance.mdc`

**Contract edits:** Append-only unless the user explicitly approves amending a named contract section. Conflicting prompts must be reported, not used to silently rewrite contracts.

---

## Issue template

```
ID:
Priority:
Status:
Screen:
Category:

Description:

Expected Behaviour:

Files Likely Affected:

Regression Tests:

User Approved:

Date Opened:

Date Closed:

Notes:
```

---

## Open — awaiting user approval (governance audit)

--------------------------------------------------------

ID: ZLOG-001  
Priority: P2  
Status: Open  
Screen: `/dashboard/diary/setup`  
Category: Site Diary  

Description:  
Setup packs Shift, Author, Reporting, Report Date, Logo, and Project Reference inside one GlassSection titled “Project and date”, mixing project-level and report-level UI (gap G1).

Expected Behaviour:  
Section headings match `SITE_DIARY_SCREEN_CONTRACT.md` without changing field order.

Files Likely Affected:  
`app/dashboard/diary/setup/page.jsx`

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Listed in `docs/contracts/PENDING_APPROVAL_GAPS.md` as G1. Do not implement until approved.

--------------------------------------------------------

ID: ZLOG-002  
Priority: P1  
Status: Open  
Screen: Setup / Project Model  
Category: Project Model  

Description:  
Project Reference is contracted as project-level on `public.projects` but implemented as session extras keyed by report id (gap G2).

Expected Behaviour:  
Either a approved projects column + migrate, or reclassify as report-level in contracts.

Files Likely Affected:  
`lib/report-setup.js`, `app/dashboard/diary/setup/page.jsx`, migrations (if approved), `docs/contracts/PROJECT_MODEL_CONTRACT.md`

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G2. LEVEL 4 if schema change.

--------------------------------------------------------

ID: ZLOG-003  
Priority: P1  
Status: Closed  
Screen: `/dashboard/diary/setup`  
Category: Site Diary  

Description:  
Selecting an existing project prefills Author / Reporting On Behalf Of / branding / Project Reference from the latest saved diary, copying report-level data (gap G3).

Expected Behaviour:  
Load sticky + programme from `public.projects` only; do not copy diary content.

Files Likely Affected:  
`app/dashboard/diary/setup/page.jsx`

Regression Tests:  
`npm run test:site-diary-contract`; `lib/diary-setup-blank.test.js`

User Approved: Yes (contract v1.1.0 + Project Name select-or-create UX)  

Date Opened: 2026-08-07  

Date Closed: 2026-08-07  

Notes:  
Resolved with Project Name select-or-create: sticky/programme only on match.

--------------------------------------------------------

ID: ZLOG-004  
Priority: P3  
Status: Open  
Screen: Setup  
Category: Site Diary  

Description:  
Confirm whether Project Day omission on setup is intentional (shown on diary Project card only) (gap G4).

Expected Behaviour:  
User confirms setup omission OR requests setup display.

Files Likely Affected:  
Possibly `app/dashboard/diary/setup/page.jsx` if display approved

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G4. Clarification only until approved.

--------------------------------------------------------

ID: ZLOG-005  
Priority: P3  
Status: Open  
Screen: Setup  
Category: Site Diary  

Description:  
Confirm Cover Photo remains diary-form-only (not on setup) (gap G5).

Expected Behaviour:  
User confirms omission OR requests setup cover.

Files Likely Affected:  
Possibly setup page if approved

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G5.

--------------------------------------------------------

ID: ZLOG-006  
Priority: P3  
Status: Open  
Screen: Project Model  
Category: Project Model  

Description:  
Project Description listed in sticky sequence but not in schema/UI (gap G6).

Expected Behaviour:  
Remain omitted until schema + UI explicitly approved.

Files Likely Affected:  
Migration + sticky components (when approved)

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G6. Do not invent column.

--------------------------------------------------------

ID: ZLOG-007  
Priority: P3  
Status: Open  
Screen: Diary form  
Category: Site Diary  

Description:  
Diary form uses label “Shift type”; setup uses “Shift” (gap G7).

Expected Behaviour:  
Aligned wording if user approves.

Files Likely Affected:  
`app/dashboard/project/[id]/diary/page.jsx`

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G7.

--------------------------------------------------------

ID: ZLOG-008  
Priority: P3  
Status: Open  
Screen: Docs  
Category: Site Diary  

Description:  
`docs/ZLOG_FUNCTIONAL_SPEC_V1.md` still mentions Day/Night/Weekend/Half day; authoritative options are Day/Back/Night (gap G8).

Expected Behaviour:  
Doc-only supersession note in the functional spec.

Files Likely Affected:  
`docs/ZLOG_FUNCTIONAL_SPEC_V1.md`

Regression Tests:  
None (docs)

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G8. Documentation only.

--------------------------------------------------------

ID: ZLOG-009  
Priority: P3  
Status: Closed  
Screen: Docs  
Category: Project Model  

Description:  
Product decisions historically said not to add Project Day to Site Diary yet; card now displays it (gap G9).

Expected Behaviour:  
Product doc matches current approval.

Files Likely Affected:  
`docs/PROTECTED_PRODUCT_DECISIONS.md`

Regression Tests:  
None (docs)

User Approved: Yes (governance pass updated product doc)  

Date Opened: 2026-08-07  

Date Closed: 2026-08-07  

Notes:  
Gap G9 addressed in product decisions wording during governance hardening. No app code change for this backlog entry.

--------------------------------------------------------

ID: ZLOG-010  
Priority: P3  
Status: Open  
Screen: `/dashboard/diary`  
Category: Site Diary  

Description:  
Hub mode title “Start New Report” vs CTA “Start New Site Diary” (gap G10).

Expected Behaviour:  
Aligned wording if user approves.

Files Likely Affected:  
`app/dashboard/diary/page.jsx`

Regression Tests:  
`npm run test:site-diary-contract` / routing tests as applicable

User Approved: No  

Date Opened: 2026-08-07  

Date Closed:  

Notes:  
Gap G10.

---

## Frozen / accepted (do not reopen without explicit request)

--------------------------------------------------------

ID: ZLOG-100  
Priority: P1  
Status: Frozen  
Screen: Setup / Hub  
Category: Site Diary  

Description:  
Start from scratch must not inherit prior diary/project/session setup state.

Expected Behaviour:  
Clean setup via blank factory; Author Name from profile; Report Date today; optional default branding only.

Files Likely Affected:  
`lib/diary-setup-blank.js`, `app/dashboard/diary/setup/page.jsx`, `app/dashboard/diary/page.jsx`

Regression Tests:  
`npm run test:site-diary-contract`; `lib/diary-setup-blank.test.js`

User Approved: Yes  

Date Opened: 2026-08-07  

Date Closed: 2026-08-07  

Notes:  
Accepted product behaviour. FROZEN.

--------------------------------------------------------

ID: ZLOG-101  
Priority: P1  
Status: Frozen  
Screen: Setup  
Category: Site Diary  

Description:  
Shift selector Day / Back / Night on setup after programme dates, before Author Name.

Expected Behaviour:  
Visible Shift control with those options; persists to `daily_reports.shift`.

Files Likely Affected:  
`app/dashboard/diary/setup/page.jsx`, `lib/diary-setup-shift.js`

Regression Tests:  
`npm run test:site-diary-contract`

User Approved: Yes  

Date Opened: 2026-08-07  

Date Closed: 2026-08-07  

Notes:  
Accepted. FROZEN. Must not disappear during unrelated work.

--------------------------------------------------------

ID: ZLOG-102  
Priority: P1  
Status: Frozen  
Screen: Diary form  
Category: Site Diary  

Description:  
View / Edit / Use as Basis distinct flows; open does not write; Edit same ID; Basis new ID; save returns View; no Recent list on open report.

Expected Behaviour:  
As `SITE_DIARY_SCREEN_CONTRACT.md` and `diary-view-mode` helpers.

Files Likely Affected:  
`app/dashboard/project/[id]/diary/page.jsx`, `lib/diary-view-mode.js`, `lib/diary-form-hydrate.js`

Regression Tests:  
`npm run test:site-diary-contract`; view-mode / hydrate tests

User Approved: Yes  

Date Opened: 2026-08-06  

Date Closed: 2026-08-07  

Notes:  
Accepted. FROZEN.

--------------------------------------------------------

ID: ZLOG-103  
Priority: P1  
Status: Frozen  
Screen: Setup / Project  
Category: Project Model  

Description:  
Project sticky fields and programme dates on `public.projects`; Project Day calculated display.

Expected Behaviour:  
Sticky load on existing project; New project clears sticky; Project Day on diary Project card when dates exist.

Files Likely Affected:  
`lib/project-sticky-fields.js`, `lib/project-day.js`, setup / project components

Regression Tests:  
`npm run test:site-diary-contract`; project-day / sticky tests

User Approved: Yes  

Date Opened: 2026-08-06  

Date Closed: 2026-08-07  

Notes:  
Accepted. FROZEN.

--------------------------------------------------------

ID: ZLOG-104  
Priority: P0  
Status: Frozen  
Screen: Diary save  
Category: Site Diary  

Description:  
Final Site Diary save is UPDATE-only by report id with verified SELECT.

Expected Behaviour:  
`finalizeSiteDiarySave`; no insert on final save; no replacement diary on open existing.

Files Likely Affected:  
`lib/diary-save.js`, diary page

Regression Tests:  
`lib/diary-save.test.js`; `npm run test:site-diary-contract`

User Approved: Yes  

Date Opened: 2026-08-05  

Date Closed: 2026-08-06  

Notes:  
Accepted. FROZEN. See `docs/M0_SAVE_LIFECYCLE.md`.
