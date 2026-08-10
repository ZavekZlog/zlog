# Project Model Contract

**Layer:** C — Feature  
**Version:** 1.0.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Initial feature contract for sticky / programme / ownership  
**User Decision:** Governance hardening — project model contract  
**Previous Version:** none  

**Status:** Binding for implemented project sticky / programme behaviour  

Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Screen: `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`

---

## Ownership

Project-level data is stored **only** on `public.projects` and referenced by diaries via `project_id`.

Do **not** duplicate project metadata onto diary rows as the source of truth.  
Do **not** load daily diary content by `project_id` alone — daily content is isolated by diary/report ID.

| UI field | Column | Notes |
|----------|--------|--------|
| Project Name | `name` | |
| Project Address | `site_address` | |
| Project Manager | `client_pm` | Column name frozen; UI label is Project Manager |
| Working Days per Week | `working_days_per_week` | 1–7 or blank |
| Current Phase | `current_phase` | |
| Project Start Date | `start_date` | |
| Planned Completion Date | `planned_completion_date` | |
| Project Description | — | **Not in live schema** — do not invent until approved |
| Project Reference | — | **Intent:** project-level. **Current impl:** session extras (`report-setup`) until a dedicated column is approved — see gaps |
| Project Day X of Y | calculated | `lib/project-day.js`; display on diary Project card when dates exist |

---

## Behaviour

- Selecting an existing project loads sticky + programme fields for that row.
- **New project — type the name below** clears every project-level field immediately.
- Start from scratch must not inherit a prior project’s sticky values.
- Progress Report programme / Gantt upload remains a **future** premium feature (`docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`) — not part of Site Diary sticky work.

---

## Helpers (do not delete without approval)

- `lib/project-sticky-fields.js`
- `lib/project-day.js`
- `lib/diary-setup-project-dates.js`
- `components/project/ProjectStickyFields.jsx`
- `components/project/ProjectDatesFields.jsx`
