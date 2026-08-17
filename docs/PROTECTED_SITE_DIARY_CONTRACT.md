# Protected Site Diary Contract

**Version:** 1.8.0
**Date Updated:** 2026-08-17
**Reason Updated:** Add confirmed saved-diary deletion; children cascade; Storage cleanup is durable and reference-safe
**User Decision:** APPROVED — saved-report deletion behaviour plus minimum shared deletion infrastructure
**Previous Version:** 1.7.0

**Status:** Binding behavioural summary for Site Diary  
**Authority:** Production product contract. Detail and control order live in **`docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`**. Do not remove, rename, relocate, disable, or silently change protected behaviours unless the user explicitly requests that exact change.

## Hierarchy

- Product: `docs/PROTECTED_PRODUCT_DECISIONS.md`
- Screen: `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`
- Feature: `docs/contracts/PROJECT_MODEL_CONTRACT.md`, `REPORT_BRANDING_CONTRACT.md`, `PHOTO_WORKSPACE_CONTRACT.md`, `REPORT_DELETION_CONTRACT.md`
- Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`
- Gaps (no silent fix): `docs/contracts/PENDING_APPROVAL_GAPS.md`

Related freeze docs:

- `docs/M0_SAVE_LIFECYCLE.md` — UPDATE-only final save
- `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` — photo workspace

Regression gate: `npm run test:site-diary-contract` (must assert **UI presence / order**, not helpers alone)

**Hard product regression gate:** `npm run test:release-gate`  
**Behaviour registry:** `docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json`

---

## 1. Site Diary entry / setup

| Requirement | Contract |
|-------------|----------|
| Back control | Visible **Back** label on setup (and hub back where applicable) |
| Distinct flows | Keep these flows separate — no state bleed between them |
| Start from scratch | Clean diary defaults; preselect the signed-in user’s last-used project when it still exists |
| Select existing project | Loads sticky project fields for that `project_id` |
| Use as Basis for New Diary | Explicit reuse; creates a **new** diary ID; original unchanged |
| Open today’s saved diary | Populated **Project & Report Details** first; Continue opens the same report in `?compose=1` |
| View historical saved diary | `?report=` → View mode; no edit implication |
| Edit saved diary | Explicit **Edit This Diary** (`?edit=1`); same diary ID |
| Clean form defaults | Author Name from signed-in profile only; Report Date may be today; new-project Working Days defaults to 5 |
| No leak | No prior diary content or session draft values into Start from scratch; project data comes only from the explicitly selected/preselected project row |

---

## 2. Project-level sticky information

Stored once on `public.projects`, referenced by diaries via `project_id` (not copied onto diary rows as the source of truth):

| UI | Storage |
|----|---------|
| Project Name | `projects.name` |
| Project Address | `projects.site_address` |
| Project Reference | Project-level intent (session extras today until a dedicated column is approved) |
| Project Manager | `projects.client_pm` (column name unchanged) |
| Working Days per Week | `projects.working_days_per_week` |
| Current Phase | `daily_reports.current_phase` — diary-specific; blank on a genuinely new diary |
| Project Description | When implemented (not in live schema yet — do not invent) |
| Project Start Date | `projects.start_date` — loads with Planned Completion Date; blank setup field never erases it |
| Planned Completion Date | `projects.planned_completion_date` — loads with Project Start Date; blank setup field never erases it |
| Project Day X of Y | Calculated display from programme dates (`lib/project-day.js`) |

Selecting **New project — type the name below** clears every project-level field immediately.

A blank Site Diary field must never overwrite valid project-owned data. Project
Name, Address, Manager, Working Days, Start Date, Planned Completion Date, and
Project Reference hydrate from the selected project and are protected from
accidental null/empty writes.

---

## 3. Report-level information

Stored on the diary/report (`daily_reports`), **not** on `public.projects`:

- Author Name (`creator_name`)
- Author Role (`creator_role`) — free text; never invent a default
- Reporting on Behalf Of (`company_reporting_for`)
- Report Date (`report_date`)
- Shift (`shift`)
- Branding / profile association (`branding_id`, `brand_color`, `brand_logo_url`)
- Cover Photo (`cover_photo_url`)
- Temporary Works applicable / N/A choice and check records (`temporary_works_applicable`, `temporary_works`)
- All daily diary content (summary, labour, plant, visitors, deliveries, permits, photos, etc.)

---

## 4. Shift (protected UI)

| Requirement | Contract |
|-------------|----------|
| Visibility | Mandatory visible Shift selector on **Site Diary setup** |
| Options | **Day**, **Back**, **Night** only (product options) |
| Position | After Project Information / programme dates; **before** Report Author |
| Persistence | Written to `daily_reports.shift` on Continue / save |
| Reload | Existing saved shift reloads in View and Edit |
| Regression | Must not disappear during unrelated refactors |

Canonical helpers: `lib/diary-setup-shift.js` (`SITE_DIARY_SHIFT_OPTIONS`, setup sequence markers).

---

## 5. Author (setup order)

1. Reporting Company (company name + logo)
2. Reporting On Behalf Of
3. **Author Name** + **Author Role**
4. Project Details (including Project Manager, Shift, Report Date, …)

Author Name comes from the signed-in profile only on scratch / Use for today — never from a previous diary.

Do not invent Author Role when none was saved.

---

## 6. Saved diaries (View / Edit)

| Requirement | Contract |
|-------------|----------|
| Open to review (hub) | Read-only saved-diary viewer — the whole record on one scrolling page (`/dashboard/project/[id]/diary/view?report=…`); no compose/edit controls; no write |
| Viewer content | Project & Report Details incl. **Current Phase** from `daily_reports.current_phase`, cover, weather, H&S / RFIs / variations, summary, labour, plant, equipment, Temporary Works & Scaffolding Checks, visitors, delays, actions, photo evidence with captions visible, signature |
| Open today’s diary for editing | Project & Report Details first; no write on open; Continue uses the same report ID |
| Open historical diary for editing | Workbench View / Edit mode (`lib/diary-view-mode.js`) |
| Wording | Must not imply editing while reviewing |
| Actions | Viewer: **Generate PDF**, **Edit This Diary**, and visually separated **Delete Diary** (confirmed; returns to the saved list). Workbench View: **Edit This Diary**, **Use as Basis for New Diary** |
| Edit ID | Same diary ID |
| Open write | Opening performs **no** database write |
| After save | Return to that diary in View mode |
| Recent lists | Only on diary-selection / hub screens — not on the open report page |
| Content isolation | Plant/equipment/temporary works and all daily content isolated by diary ID |
| Delete saved diary | Explicit **Select** on the saved list, or **Delete Diary** on the opened viewer / project recent list. Never one-tap. Confirmed with the actual count. Remaining diaries stay. Feature contract: `docs/contracts/REPORT_DELETION_CONTRACT.md` |

Project & Report Details is a pre-flight, not a create flow. It hydrates the
existing report’s saved Report Date, Shift, Current Phase, identity and linked
project values. Continuing may update changed details only; it must not insert a
replacement report or reset cover photo, photo evidence, area notes, attendance,
visitors, permits, delivery notes, or any other report-owned content.

### Temporary Works & Scaffolding Checks (protected)

| Requirement | Contract |
|-------------|----------|
| Position | After Equipment on hire; before Visitors |
| Applicability | **Temporary works apply today** / **Not applicable today** |
| Records | Add / edit / delete multiple items when applicable |
| Fields | Type · Location / Description · Status · optional TWC/TWS/Reference · Check Result · Notes / Action |
| Scaffold-only | Scaffold check / inspection status + optional Scaffold tag / inspection reference — only when Type = Scaffold |
| Scaffold statuses | Checked today — satisfactory · Formal inspection current · Issue identified · Not checked today |
| Persistence | `temporary_works_applicable` + `temporary_works` on the same diary ID |
| Review / PDF | Saved viewer and existing Temporary Works PDF schedule; N/A omits empty schedule |

---

## 7. Branding

- Existing diary branding remains attached.
- Normal Edit mode must **not** force branding reconfirmation / full selector.
- Changing branding requires a separate explicit action.

---

## 8. Summary

- Summary is **optional**.
- A diary can be saved without entering Summary.

---

## 9. Photo / location work

Existing approved photo, annotation, and location-walk functionality is protected. Do not alter it during unrelated setup work.

---

## 10. Agent process (mandatory)

Before editing any Site Diary, project setup, or saved-diary file:

1. Read **this** document.
2. List protected behaviours the proposed files affect.
3. Preserve all protected behaviours not explicitly targeted by the user.
4. Run `npm run test:site-diary-contract`.
5. Refuse broad page rewrites where a local change is possible.
6. Report conflicts with this contract **before** editing.
7. Never delete or hide a protected control without explicit user approval.
8. Never commit or push without manual verification.

### Impact analysis (shared pages)

Before implementation, report:

- Exact files to change
- All existing controls rendered by those files
- Protected controls at risk
- Whether the change can be isolated into a helper/component
- Regression tests that will prove nothing disappeared

No implementation until that analysis is complete.

---

## 11. Inventory checklist (quick)

- [ ] Back label
- [ ] Scratch / existing project / Use as Basis / View / Edit distinct
- [ ] Clean scratch form
- [ ] Sticky project fields + programme dates + Project Day
- [ ] Shift Day / Back / Night on setup (correct order)
- [ ] Author Name + Author Role order
- [ ] Report-level vs project-level split
- [ ] View / Edit / Basis / no open write / post-save View
- [ ] Confirmed saved-diary delete (Select mode / Delete Diary; project + shared assets preserved)
- [ ] No Recent list on open report
- [ ] Branding not forced in Edit
- [ ] Summary optional
- [ ] Plant isolation by diary ID
- [ ] Photo / location freeze unless asked
