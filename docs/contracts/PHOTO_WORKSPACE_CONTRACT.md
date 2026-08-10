# Photo Workspace Contract (implemented freeze)

**Layer:** C — Feature  
**Version:** 1.0.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Initial freeze contract for implemented photo / location evidence  
**User Decision:** Governance hardening — photo workspace feature contract  
**Previous Version:** none  

**Status:** Binding freeze for currently implemented photo / location evidence  

**Architecture source of truth:** `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md`  
Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`

---

## Scope of this contract

This feature contract covers **already implemented** Site Diary photo, annotation, and location-walk behaviour hosted on the diary form. It does **not** authorise new Shared Photo Workspace milestones (P2B+) unless the user explicitly asks.

---

## Protected rules

1. Do **not** alter photo, annotation, or location-walk functionality during unrelated Site Diary setup / sticky / author / shift work.
2. Photo evidence is **report-level** — associated with the open diary/report ID, not loaded by `project_id` alone.
3. Do not break Site Diary save (`finalizeSiteDiarySave`) as part of photo work.
4. Do not introduce Shared Report Workspace shell work under photo tasks.
5. Progress Report programme / Gantt is **out of scope** for Photo Workspace.

---

## When changing photo code

- Read `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` and this contract.
- Produce a full pre-change impact report (see commercial governance rule).
- Prefer minimum local diff; do not rewrite the diary page to touch photos.
