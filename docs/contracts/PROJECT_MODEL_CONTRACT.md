# Project Model Contract

**Layer:** C — Feature  
**Version:** 1.3.0
**Date Updated:** 2026-08-14
**Reason Updated:** Protect project-owned values from blank diary writes and move Current Phase to individual diaries
**User Decision:** BATCH 1 PROJECT OWNERSHIP AND BLANK-FIELD PROTECTION
**Previous Version:** 1.2.0

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
| Project Address | `site_address` | Load and save against the selected project |
| Project Manager | `client_pm` | Project-specific; column name frozen; UI label is Project Manager |
| Working Days per Week | `working_days_per_week` | Existing project uses its saved 1–7 value; genuinely new project defaults to 5 |
| Project Start Date | `start_date` | Project-level; hydrates with Planned Completion Date, never from another diary |
| Planned Completion Date | `planned_completion_date` | Project-level; hydrates with Project Start Date, never from another diary |
| Project Description | — | **Not in live schema** — do not invent until approved |
| Project Reference | `project_reference` | Project-specific job / contract reference |
| Project Day X of Y | calculated | `lib/project-day.js`; display on diary Project card when dates exist |

`Current Phase` is not project-level. It is stored on
`public.daily_reports.current_phase` for the individual diary.

---

## Behaviour

- Selecting an existing project loads sticky + programme fields for that row.
- Both programme dates are loaded together for the selected project, and both reappear on every later diary for that project. A genuinely new project starts with both blank and saves both when entered.
- Typing an existing project name matches that project regardless of letter case or surrounding spaces, so its saved fields load before Continue writes the row.
- Site Diary setup never clears a saved programme date: a blank date field keeps the stored value. Dates are cleared only from the project's own dates editor.
- A blank Site Diary setup field never clears saved Project Address, Project Manager, Working Days, programme dates, or Project Reference. Project Name remains required and cannot be written blank.
- Current Phase starts blank on a genuinely new diary, is saved on that diary, and is never loaded from or written to `projects.current_phase`.
- A genuinely new diary preselects the signed-in user’s last-used project when that project still exists; Project Name remains editable/selectable.
- **New project — type the name below** clears project-level fields immediately, then defaults Working Days per Week to 5.
- Changing project selection must not clear Reporting Company, logo, Reporting On Behalf Of, Author Name, or Author Role.
- Progress Report programme / Gantt upload remains a **future** premium feature (`docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`) — not part of Site Diary sticky work.

---

## Helpers (do not delete without approval)

- `lib/project-sticky-fields.js`
- `lib/project-day.js`
- `lib/diary-setup-project-dates.js`
- `components/project/ProjectStickyFields.jsx`
- `components/project/ProjectDatesFields.jsx`
