# Photo Workspace Contract (implemented freeze)

**Layer:** C — Feature  
**Version:** 1.3.0
**Date Updated:** 2026-09-02
**Reason Updated:** PHOTO-001 presentation — cover preview follows image aspect at available width; no fixed landscape letterbox
**User Decision:** COVER PHOTO PRESENTATION — REMOVE ARTIFICIAL LETTERBOX STAGE
**Previous Version:** 1.2.0

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
6. On an existing Site Diary, saved evidence groups display their photos and captions by default; review does not require Expand.
7. The saved area’s 1 / 4 / 6 photos-per-page value controls its review density and remains unchanged.
8. Default visibility is presentation only: it does not enter area edit mode, change persistence, or expose a blank new-area editor as saved content.
9. **Edit** continues to edit the same saved area. A genuinely new diary still starts with no saved groups, notes, or photos.
10. **PHOTO-001.**
    - **Content:** All user photographs must preserve the complete image and original aspect ratio. Cropping is prohibited in app and PDF surfaces. Distortion is prohibited. Never crop/cover.
    - **Presentation:** Where practical, a cover preview uses the available card width and derives height from the photograph’s aspect ratio. Ordinary portrait and landscape covers must not be forced into a fixed landscape letterbox that creates artificial side bands.

---

## When changing photo code

- Read `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` and this contract.
- Produce a full pre-change impact report (see commercial governance rule).
- Prefer minimum local diff; do not rewrite the diary page to touch photos.
