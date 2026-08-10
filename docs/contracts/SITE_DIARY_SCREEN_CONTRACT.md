# Site Diary — Screen Contract

**Layer:** B — Screen  
**Version:** 1.1.1  
**Date Updated:** 2026-08-07  
**Reason Updated:** Link Global UI Text Fit contract; overflow audit required for setup/hub/diary UI  
**User Decision:** GLOBAL UI CONSTITUTION — TEXT MUST ALWAYS FIT  
**Previous Version:** 1.1.0  

**Status:** Binding production contract  
**Routes:**

- Hub: `/dashboard/diary` (Open Saved Diaries; optional Start New → setup)
- Setup: `/dashboard/diary/setup`
- Diary form: `/dashboard/project/[id]/diary`

**Supersedes (UI order / Shift):** Informal notes and `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` passages that still list shift as Day / Night / Weekend / Half day. **Authoritative shift options are Day / Back / Night.**

**Supersedes (v1.0.0 §2 project selector):** The separate **Which project is this diary for?** control is removed. Project choice is via **Project Name** only.

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
Navigation: visible **Back** control.

### PROJECT AND DATE

1. **Project Name** — single control for project choice:
   - Select / choose an **existing** project name → load that project’s **sticky** information from `public.projects` and retain `project_id`
   - Type a **new** project name → create a new project on Continue (no sticky leak from a prior selection)
   - There is **no** separate “Which project is this diary for?” screen or dropdown

### STICKY PROJECT INFORMATION

2. **Project Address**
3. **Project Manager**
4. **Working Days per Week**
5. **Current Phase**
6. **Project Description** — once implemented (not in live schema yet)
7. **Project Start Date**
8. **Planned Completion Date**
9. **Project Day** — calculated where displayed (typically diary Project card, not necessarily setup)

### SHIFT

10. **Shift** — options exactly: **Day**, **Back**, **Night**  
    Position: after programme dates; **before** Report Author. Must never disappear during unrelated work.

### REPORT AUTHOR

11. **Author Name**
12. **Author Role** — directly beneath Author Name; free text; never invent a role

### REPORT DETAILS

13. **Reporting On Behalf Of**
14. **Report Date**
15. **Branding / logo** (Company / Client Logo on setup)
16. **Project Reference** where currently approved on this screen
17. **Cover Photo** where currently approved (today: diary form, not setup)

Primary CTA: **Continue to fill in your diary**

Project-level fields must not be mixed into report-level persistence. Visually, Shift and Author are report-level and must remain in the sequence above.

---

## 3. Distinct flow contracts (no stale state)

| Flow | Contract |
|------|----------|
| **A. Start from scratch** | Blank project + diary setup; Author Name may prefill from profile; Report Date may be today; approved default branding may load; all other project/report fields blank |
| **B. Select existing project** | Via **Project Name** matching an existing project; load sticky fields from `public.projects`; keep `project_id`; do **not** copy diary content |
| **C. View saved diary** | Read-only; no DB write on open; neutral wording; **Edit This Diary**; **Use as Basis for New Diary** |
| **D. Edit saved diary** | Same diary ID; rehydrate saved values; no duplicate; save → View |
| **E. Use as Basis** | New diary ID; original unchanged; only approved reusable fields |

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

**Dashboard → New Site Diary** opens **`/dashboard/diary/setup` directly** (clears setup session draft; scratch init). No intermediate project-selection page.

Route `/dashboard/diary` (**Open Saved Diaries** hub) remains **completely separate**:

- **Open Saved Diaries** → open exact existing report (`?report=`)
- **Start New Site Diary** (if shown on hub) → setup (clears setup session draft; scratch init)

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
