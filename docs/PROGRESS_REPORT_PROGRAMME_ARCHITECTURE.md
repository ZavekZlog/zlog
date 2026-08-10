# Progress Report — Project Programme Architecture

**Status:** APPROVED product requirements — **not scheduled for implementation**  
**Recorded:** 2026-08-06  
**Classification:** Future **Progress Report premium** capability  
**Out of scope now:** Photo Workspace (P2), Site Diary UI, shared report shell, schema changes

---

## Approved product decision

> The Progress Report will eventually allow a project programme or Gantt chart to be uploaded once, reused in weekly reports, marked with a progress date line and annotated to show completed, ongoing and delayed work. The original programme must remain unchanged.

---

## 1. Core project dates and Project Day

Each project will eventually contain:

| Field | Level | How it is set |
|-------|--------|----------------|
| **Project Start Date** | Project | Entered once by the user |
| **Planned Completion Date** | Project | Entered once by the user |
| **Project Day** | Derived | **Calculated automatically** from Project Start Date and Planned Completion Date (e.g. `Project Day 17 of 50`) |

These are **project-level** values. Start and Planned Completion must **not** be re-entered on each daily report. **Project Day** requires **no daily input**.

### Planned displays

Future reports (especially Progress Report, and optionally Site Diary later) will show:

- Project Start Date  
- Planned Completion Date  
- **Project Day**, e.g. `Project Day 17 of 50` or `Project Day: 17 of 50`  
- **Planned Days Remaining** (also derived automatically)

### Meaning of “Project Day”

**Project Day** is an **approved planned product feature**.

It represents **elapsed programme time only**, calculated automatically from the project start and planned completion dates.

It must **not** be presented as:

- percentage of physical work complete;  
- actual construction progress;  
- confirmation that the project is on programme.

**Open before implementation:** whether Project Day / Planned Days Remaining use **calendar days** or **working days** must be explicitly resolved. Do not implement until that decision is recorded.

---

## 2. Site Diary (later display of Project Day)

The Site Diary **will later be able to** show the automatically calculated project-time reference, for example:

`Project Day 17 of 50`

- Derived automatically from Project Start Date and Planned Completion Date  
- **No daily input** required  

**Do not add this to the current Site Diary yet.**

---

## 3. Project programme upload (Progress Report)

Future premium Progress Report capability:

- User uploads the project’s **approved Gantt / construction programme** once.  
- Accepted formats (to be finalised later): **PDF**, **image**, and/or other supported document formats.  
- Stored as a **project-level document**.  
- Reused across **weekly Progress Reports**.  
- Re-upload only when a **revised programme** is issued — not every week.

---

## 4. Weekly Progress Date Line

Within a Progress Report, the user will later be able to:

1. Open the uploaded project programme.  
2. Draw a **Progress Date Line** / **Progress Drop-Line** at the reporting date.  
3. Save the marked-up programme as evidence for **that week’s** Progress Report.  
4. Keep previous weekly marked-up versions **without overwriting** the original programme.

### User-facing terminology (UI)

| Use | Avoid in UI |
|-----|-------------|
| Progress Date Line | Technical drawing API names |
| Progress Drop-Line | “canvas stroke”, “overlay layer” |
| Mark Up Programme | Implementation jargon |

---

## 5. Programme annotation (Mark Up Programme)

The future programme-markup workspace **may** support:

- Progress date line / drop-line  
- Arrows  
- Text notes  
- Freehand markup  
- Transparent highlighting  
- Completed activities  
- Activities in progress  
- Delayed activities  

### Suggested status language (communicative, not decorative)

| Colour | Meaning |
|--------|---------|
| Green | Complete |
| Amber | In Progress |
| Red | Delayed / At Risk |

**Rules:**

- Colours communicate **status only** — not decoration.  
- The **original uploaded programme remains unchanged**.  
- Each weekly Progress Report uses a **separate non-destructive marked-up version**.

---

## 6. Progress Report output (future PDF)

A future Progress Report **may** include:

- Project Start Date  
- Planned Completion Date  
- Project Day  
- Planned Days Remaining  
- Current reporting week  
- Programme status narrative  
- Marked-up Gantt / programme  
- Progress date line  
- Delays and risks  
- Look-ahead activities  

The PDF must clearly distinguish:

1. **Planned programme** (original / baseline view)  
2. **Reported actual progress** (author’s assessment for the week)  
3. **Comments or annotations** added by the report author  

---

## 7. Future development boundary

**Not** part of the current Shared Photo Workspace milestone.

**Not** to be scheduled or implemented until explicitly approved as a Progress Report premium workstream.

### Recommended future phases (record only — do not start)

| Phase | Scope | Status |
|-------|--------|--------|
| **PR1** | Project start and planned completion dates | **Partial (code):** create/edit fields + `planned_completion_date` migration file — apply migration before live use |
| **PR2** | **Project Day** — automatic calendar-day calculation | **Partial (code):** `lib/project-day.js` + Progress Report summary; Site Diary display still deferred |
| **PR3** | Programme upload and project document storage | Not started |
| **PR4** | Programme viewer | Not started |
| **PR5** | Progress date-line tool | Not started |
| **PR6** | Non-destructive programme annotation | Not started |
| **PR7** | Weekly version history | Not started |
| **PR8** | Progress Report PDF integration | Not started |

**UI mount (PR2 display):** `ProjectProgrammeSummary` on Site Progress Report (`SimpleBrandedReportPage` when `contextId === 'progress'`) and project hub preview. **Not** on Site Diary.

---

## Related documents

- `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` — functional requirements summary  
- `docs/PRODUCT_ROADMAP.md` — roadmap placement  
- `docs/PREMIUM_FEATURE_BACKLOG.md` — backlog entry  
- `docs/PROTECTED_PRODUCT_DECISIONS.md` — protected decision / regression contract  
- `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` — explicitly out of Photo Workspace scope  
- `docs/SHARED_REPORT_WORKSPACE_ARCHITECTURE.md` — Progress module later; programme feature separate premium track  

---

*Documentation only. No production code, schema, Site Diary, or Photo Workspace changes accompany this record.*
