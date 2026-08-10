# Zlog Product Roadmap

**Status:** Living roadmap (documentation)  
**Updated:** 2026-08-06  
**Branch context:** `architecture-rebuild`

This document records **approved sequencing**. Items marked *future / not scheduled* must not be implemented until explicitly approved.

---

## Active / near-term (rebuild track)

| Track | Status | Notes |
|-------|--------|--------|
| Site Diary M0 save / session recovery | Stable — do not regress | `finalizeSiteDiarySave`, `?report=` UPDATE |
| Shared Photo Workspace (P2A–P2F) | In progress / phased | Prove in Site Diary first |
| Shared Report Workspace shell | Frozen — deferred | After Photo Workspace is proven |
| Diary hub / saved diaries UX | Copy and routing contracts frozen as approved | See `lib/diary-routing.js` |

---

## Future — Progress Report premium (programme)

**Architecture:** `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`  
**Classification:** Premium Progress Report capability  
**Do not schedule or implement now.**

### Planned project-time features (approved)

Each project will eventually include:

- **Project Start Date** (entered once)  
- **Planned Completion Date** (entered once)  
- **Project Day** — calculated **automatically** from those dates (e.g. `Project Day 17 of 50`)  
- **Planned Days Remaining** (also automatic)

**Project Day** is elapsed programme time only — not physical % complete. Calendar vs working days must be resolved before PR2 coding.

| Phase | Name | Depends on |
|-------|------|------------|
| **PR1** | Project start & planned completion dates | Project model decision |
| **PR2** | **Project Day** — automatic calculation (e.g. Project Day 17 of 50) + Planned Days Remaining | PR1 + calendar vs working-days decision |
| **PR3** | Programme upload & project document storage | Project document store |
| **PR4** | Programme viewer | PR3 |
| **PR5** | Progress date-line tool | PR4 |
| **PR6** | Non-destructive programme annotation | PR5 |
| **PR7** | Weekly version history | PR6 |
| **PR8** | Progress Report PDF integration | PR7 + Progress Report module rebuild |

**Roadmap placement:** After core Photo Workspace and Progress Report module foundations — **not** interleaved with current Photo Workspace milestones.

---

## Explicitly out of current milestones

- Project Day on Site Diary UI  
- Gantt / programme upload  
- Progress Date Line / Mark Up Programme  
- Programme annotation colours as decorative chrome  
- Any schema for programme documents or project dates **until PR1–PR3 are approved for coding**

---

## Related

- Functional spec: `docs/ZLOG_FUNCTIONAL_SPEC_V1.md`  
- Protected decisions: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
- Premium backlog: `docs/PREMIUM_FEATURE_BACKLOG.md`
