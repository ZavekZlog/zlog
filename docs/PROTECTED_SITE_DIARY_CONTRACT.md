# Protected Site Diary Contract

**Version:** 1.1.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Point to screen/feature hierarchy, backlog, and UI gate requirements  
**User Decision:** Governance hardening + final change-control pass  
**Previous Version:** 1.0.0 (2026-08-07 behavioural summary)  

**Status:** Binding behavioural summary for Site Diary  
**Authority:** Production product contract. Detail and control order live in **`docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`**. Do not remove, rename, relocate, disable, or silently change protected behaviours unless the user explicitly requests that exact change.

## Hierarchy

- Product: `docs/PROTECTED_PRODUCT_DECISIONS.md`
- Screen: `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`
- Feature: `docs/contracts/PROJECT_MODEL_CONTRACT.md`, `REPORT_BRANDING_CONTRACT.md`, `PHOTO_WORKSPACE_CONTRACT.md`
- Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`
- Gaps (no silent fix): `docs/contracts/PENDING_APPROVAL_GAPS.md`

Related freeze docs:

- `docs/M0_SAVE_LIFECYCLE.md` — UPDATE-only final save
- `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` — photo workspace

Regression gate: `npm run test:site-diary-contract` (must assert **UI presence / order**, not helpers alone)

---

## 1. Site Diary entry / setup

| Requirement | Contract |
|-------------|----------|
| Back control | Visible **Back** label on setup (and hub back where applicable) |
| Distinct flows | Keep these flows separate — no state bleed between them |
| Start from scratch | Clean setup form via `initialiseNewDiarySetupState` / `blankDiarySetupFormState` |
| Select existing project | Loads sticky project fields for that `project_id` |
| Use as Basis for New Diary | Explicit reuse; creates a **new** diary ID; original unchanged |
| View saved diary | `?report=` → View mode; no edit implication |
| Edit saved diary | Explicit **Edit This Diary** (`?edit=1`); same diary ID |
| Clean form defaults | Author Name from signed-in profile only; Report Date may be today |
| No leak | No prior diary/project/session draft values into Start from scratch |

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
| Current Phase | `projects.current_phase` |
| Project Description | When implemented (not in live schema yet — do not invent) |
| Project Start Date | `projects.start_date` |
| Planned Completion Date | `projects.planned_completion_date` |
| Project Day X of Y | Calculated display from programme dates (`lib/project-day.js`) |

Selecting **New project — type the name below** clears every project-level field immediately.

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

1. Project Information (sticky + programme dates)
2. **Shift**
3. **Author Name** (immediately after Shift / project block)
4. **Author Role** directly beneath Author Name (free text, e.g. Site Manager)
5. Reporting on Behalf Of, Report Date, branding…

Do not invent Author Role when none was saved.

---

## 6. Saved diaries (View / Edit)

| Requirement | Contract |
|-------------|----------|
| Open | View mode by default (`lib/diary-view-mode.js`) |
| Wording | Must not imply editing while in View |
| Actions | **Edit This Diary**, **Use as Basis for New Diary** |
| Edit ID | Same diary ID |
| Open write | Opening performs **no** database write |
| After save | Return to that diary in View mode |
| Recent lists | Only on diary-selection / hub screens — not on the open report page |
| Content isolation | Plant/equipment and all daily content isolated by diary ID |

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
- [ ] No Recent list on open report
- [ ] Branding not forced in Edit
- [ ] Summary optional
- [ ] Plant isolation by diary ID
- [ ] Photo / location freeze unless asked
