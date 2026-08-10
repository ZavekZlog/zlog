# Premium Feature Backlog

**Status:** Documentation backlog only — not a sprint plan  
**Updated:** 2026-08-06

Items here are **approved as product intent** unless marked otherwise. They are **not** authorised for implementation until pulled onto an active milestone.

---

## Progress Report — Project Programme (premium)

**Decision (approved):**

> The Progress Report will eventually allow a project programme or Gantt chart to be uploaded once, reused in weekly reports, marked with a progress date line and annotated to show completed, ongoing and delayed work. The original programme must remain unchanged.

**Spec:** `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`  
**Roadmap phases:** PR1–PR8 in `docs/PRODUCT_ROADMAP.md`

| ID | Capability | Priority class |
|----|------------|----------------|
| PR-BL-01 | Project Start Date + Planned Completion Date (project-level, entered once) | Premium foundation |
| **PR-BL-02** | **Project Day** — automatically calculated from start + planned completion (e.g. Project Day 17 of 50); Planned Days Remaining; elapsed programme time only | **Approved planned feature** |
| PR-BL-03 | Site Diary display of automatic Project Day (no daily input) | Later; not now |
| PR-BL-04 | Upload programme once (PDF / image / TBD formats) | Premium |
| PR-BL-05 | Reuse programme across weekly Progress Reports | Premium |
| PR-BL-06 | Progress Date Line / Progress Drop-Line | Premium |
| PR-BL-07 | Mark Up Programme (arrows, text, freehand, highlight, status) | Premium |
| PR-BL-08 | Status colours: Green Complete / Amber In Progress / Red Delayed–At Risk | Premium (status only) |
| PR-BL-09 | Non-destructive weekly marked-up versions; original immutable | Premium |
| PR-BL-10 | Progress Report PDF: planned vs actual vs author annotations | Premium |

**Blocked before coding PR2 / PR-BL-02:** ~~resolve calendar days vs working days~~ — **initial implementation uses calendar days** (see `lib/project-day.js`). Working-days mode remains a later product decision.

**Not this backlog track:** Shared Photo Workspace capture/viewer/upload queue.

---

## Other premium / future (placeholder index)

| Area | Notes |
|------|--------|
| Shared Report Workspace shell | Frozen; see `docs/SHARED_REPORT_WORKSPACE_ARCHITECTURE.md` |
| Live registers (RFI, variations, permits) | Functional spec §6.4 |
| Today’s Report rename / expanded daily checks | Functional spec phases 1–2 |

---

*No production code is implied by listing an item here.*
