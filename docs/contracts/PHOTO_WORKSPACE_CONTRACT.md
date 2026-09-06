# Photo Workspace Contract (implemented freeze)

**Layer:** C — Feature  
**Version:** 1.6.0
**Date Updated:** 2026-09-06
**Reason Updated:** Site Diary audit — H&S evidence may link canonical photos; PHOTO-001 unchanged; 1/4/6 layouts and empty-caption clutter are PDF contract
**User Decision:** APPROVED — Phase 0; no photo implementation
**Previous Version:** 1.5.0

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
    - **Presentation:** Where practical, a cover preview uses the available card width and derives height from the photograph’s aspect ratio. Ordinary portrait and landscape covers must not be forced into a fixed landscape letterbox that creates artificial side bands. Other surfaces may use a different frame (including fixed 88×88 / 72×72 thumbs and a height-capped pending preview). Empty letterbox space inside that frame is allowed. The photograph inside the frame must be contain-fit — never cover/crop, never distorted.
    - **Owning surfaces:** `AnnotationPendingReview`, `AnnotationPhotoCard`, `AnnotationSavedList`, area-photo filmstrip, capture thumbnail grid, capture preview, annotation viewer/editor, setup cover preview, Site Diary workbench/saved-view photos, PDF photo/cover layout (`lib/photo-workspace/photo-001-no-crop.js` `PHOTO_001_OWNING_SURFACES`). Decorative landing imagery is out of scope.
11. **Rotation is edit-session only.**
    - Rotate during capture/edit may be kept as temporary UI metadata.
    - At durable persist, bake the chosen rotation into canonical `report.jpg` / `thumb.jpg` (full-frame, no crop) and store `rotation_degrees` as **0**.
    - A reopened saved diary must display those pixels as-is — it must not rotate again.
    - PDF for newly prepared saved photos (`processing_version` = pipeline v1 and rotation 0) is JPEG pass-through: no `flattenPhotoSrcForPdf`, no orientation bake, no PDF-time rotation. Target: `photoBakeCount = 0`.
    - Legacy rows that still have non-zero `rotation_degrees` keep the defensive flatten/rotate path. Do not rewrite historical assets unless the user edits and saves them again.

12. **H&S evidence linking (approved intent; not implemented in Phase 0).** H&S records may **+ Add photo** or **Attach existing photo**. Links must reuse canonical Zlog photo assets (same `report_photos` row / storage object). Do not duplicate image files into an H&S-specific silo. The same canonical image may be linked to an H&S item and a photo work area. Future H&S Report consumes the same evidence links. PHOTO-001 applies. Report-level photo ownership (§2) remains until an authorised project-media phase.

13. **PDF photo pages (approved; not implemented in Phase 0).** Dynamic 1 / 4 / 6 layouts must respect the chosen layout. A leftover single photo must not sit in one cell of an empty 4-up grid. Empty caption placeholders must not clutter the report. Detail: `SITE_DIARY_SCREEN_CONTRACT.md` §4L.

---

## When changing photo code

- Read `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` and this contract.
- Produce a full pre-change impact report (see commercial governance rule).
- Prefer minimum local diff; do not rewrite the diary page to touch photos.
