# Site Diary — Screen Contract

**Layer:** B — Screen  
**Version:** 1.2.0  
**Date Updated:** 2026-08-10  
**Reason Updated:** Restore approved entry hub + locked setup hierarchy (Reporting Company first); ban implementation terminology in UI  
**User Decision:** SITE DIARY WORKFLOW REGRESSION FIX  
**Previous Version:** 1.1.1  

**Status:** Binding production contract  
**Routes:**

- Hub: `/dashboard/diary` (Today’s Report: Start a new diary / Use a previous diary)
- Setup: `/dashboard/diary/setup`
- Diary form: `/dashboard/project/[id]/diary`

**Supersedes (UI order / Shift):** Informal notes and `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` passages that still list shift as Day / Night / Weekend / Half day. **Authoritative shift options are Day / Back / Night.**

**Supersedes (v1.1.x §5 dashboard entry):** Dashboard Site Diary opens the **hub** (`/dashboard/diary`), not setup directly.

**Supersedes (v1.1.x §2 setup sequence):** Locked hierarchy is Reporting Company → Reporting On Behalf Of → Author → Project Details (Project Manager is inside Project Details only).

Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Behaviour summary: `docs/PROTECTED_SITE_DIARY_CONTRACT.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`  
Gate: `npm run test:site-diary-contract`  
Global UI: `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md` (intentional design; text must fit; mobile visual QA required)  
Release Gate: `docs/ZLOG_RELEASE_GATE.md` (mandatory — feature incomplete until all six QA gates pass)

---

## 1. No silent removal

A protected control or behaviour on these screens may not be removed, hidden, renamed, moved, disabled, made conditional, replaced, reinterpreted, or disconnected from persistence unless the user **explicitly** requested that exact change.

Refactoring, cleanup, simplification, deduplication, modernisation, “better UX”, or “consistency” are **not** authorisation.

---

## 2. Setup screen — approved control sequence

Route: `/dashboard/diary/setup`  
Title: **New Site Diary**  
Navigation: visible **Back** control (to Site Diary hub).

### REPORTING COMPANY

1. **Reporting Company Name** — from the signed-in user’s company branding profile when available  
2. **Reporting Company Logo** — branding / logo for who is producing the report

### REPORTING ON BEHALF OF

3. **Reporting On Behalf Of** — client / main contractor / organisation

### AUTHOR

4. **Author Name** — from explicitly saved profile author name only (`users.full_name` / auth `user_metadata.full_name`); never from email, username, or a previous diary  
5. **Author Role** — free text from explicit profile job title when present; never invent a role

### PROJECT DETAILS

6. **Project Name** — single control for project choice:
   - Select / choose an **existing** project name → load that project’s remembered project fields from `public.projects` and retain `project_id`
   - Type a **new** project name → create a new project on Continue (no leak from a prior selection)
7. **Project Address**
8. **Project Manager** — must remain inside Project Details (never above Reporting Company)
9. **Working Days per Week**
10. **Current Phase**
11. **Project Description** — once implemented (not in live schema yet)
12. **Project Start Date**
13. **Planned Completion Date**
14. **Shift** — options exactly: **Day**, **Back**, **Night**
15. **Report Date**
16. **Project Reference** where currently approved on this screen

Primary CTA: **Continue to Site Diary**

### UI language (mandatory)

User-visible copy must never include implementation terms such as: sticky, sticky fields, persistent, persistence, stored values, inherited values, database fields, cached project information, “remembered for this project”.

Setup introduction (exact): **Confirm the details for today's Site Diary, then continue.**

Do not show helper lines that explain persistence (for example “Programme dates for this project”).

---

## 3. Distinct flow contracts (no stale state)

| Flow | Contract |
|------|----------|
| **A. Start a new diary** | Hub → setup; blank project + diary setup; Author Name prefills from profile; Report Date may be today; approved default branding / company name may load; all other project/report fields blank |
| **B. Select existing project** | Via **Project Name** matching an existing project; load remembered project fields from `public.projects`; keep `project_id`; do **not** copy diary content |
| **C. Use a previous diary** | Hub list → **Use for today** creates a **new** diary ID from the selected diary (appropriate reusable fields only); Author from profile, not source; **Open to review** opens the exact existing report in View |
| **D. View saved diary** | Read-only; no DB write on open; neutral wording; **Edit This Diary**; **Use as Basis for New Diary** |
| **E. Edit saved diary** | Same diary ID; rehydrate saved values; no duplicate; save → View |

State from one flow must not leak into another.

---

## 4. Diary form screen (saved / draft)

Route: `/dashboard/project/[id]/diary?report=…`  
Modes: View (`?report=`) · Edit (`?edit=1` or draft)

Protected interactions:

- Open → View (no write)
- **Edit This Diary** → same ID
- **Use as Basis for New Diary** → new ID
- Save → same diary in View; no Recent Diaries list on open report page
- Branding not forced in normal Edit
- Summary optional
- Plant / daily content isolated by report ID
- Project association retained; Project Day visible when dates exist
- Shift reloads from `daily_reports.shift`

---

## 5. Hub screen and Dashboard entry

**Dashboard → Site Diary** opens **`/dashboard/diary`** (Today’s Report hub).

Hub choices (clear site language):

- **Start a New Diary** → `/dashboard/diary/setup` (clears setup session draft; blank init for today)
  - Supporting text: Start with a blank diary for today.
- **Use a Previous Diary** → list prior diaries:
  - Supporting text: Start today's diary using details from an earlier diary.
  - **Use for today** → creates a **new** diary ID (source diary unchanged)
  - **Open to review** → exact existing report in View (`?report=`)

---

## 6. Completion checklist (every Site Diary task)

- Contracts read (this file + product + relevant feature contracts)
- Protected items affected listed
- Controls preserved vs intentionally changed
- `npm run test:site-diary-contract` result
- Full regression result
- Exact files changed
- Confirmation: no unrelated control disappeared; no unrelated persistence path changed
- Manual mobile verification

A task is complete only when the change works **and** protected controls, order, and persistence remain intact.
