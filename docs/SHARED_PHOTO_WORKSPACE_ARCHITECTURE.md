# Shared Photo Workspace — Architecture Review

**Status:** PLANNING ONLY — awaiting approval before implementation  
**Milestone:** P2 (after frozen Shared Report Workspace; before shared report shell)  
**Date:** 2026-08-06  

**Constraints (locked):**

- No production code in this milestone review
- Do not modify existing photo components until implementation is approved
- Do not alter database tables yet
- Do not change Site Diary save logic, report routing, authentication, or the frozen Shared Report Workspace architecture (`docs/SHARED_REPORT_WORKSPACE_ARCHITECTURE.md`)
- **Out of scope:** Progress Report programme / Gantt upload, Progress Date Line, and Mark Up Programme (`docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`) — future premium feature; not part of Photo Workspace

---

## 1. Recommended user journey

Mobile-first, one-handed, interruption-tolerant. Photos are **structured report evidence**, not generic attachments.

```text
Enter evidence section (Photo Evidence)
        │
        ▼
Tap “Add Work Area” (or report-specific label)
        │
        ▼
Enter area / location / item name
Enter short description (work / observation / defect / hazard)
        │
        ▼
Take Photo  and/or  Add Photos (multi)
        │
        ▼
Thumbnail strip for this area
        │
   ┌────┴────┐
   │ Tap thumb│ → Full-screen review
   │          │     ← → previous / next
   │          │     Rotate · Caption · Annotate · Delete · Replace
   └────┬────┘
        │
Reorder within area (V1: explicit move controls)
        │
        ▼
Save Area
  → persists area record + photo associations + order
  → does NOT complete the full report
        │
        ▼
Clear choice:
  • Add Another Area
  • No More Areas — Continue
        │
        ▼
Areas + photos preserved when the report is revisited
(after area/report persistence — see §7)
```

**Rules:**

- Do **not** require saving each photo separately
- “Save Area” ≠ “Upload complete” ≠ “Save Site Diary / Report”
- Every screen answers: Where am I? Which area? Are photos secure? What’s next?

---

## 2. Component hierarchy

```text
PhotoWorkspace                         ← section host inside a report editor
├── EvidenceGroupList                  ← saved areas / items (expandable cards)
├── EvidenceGroupEditor                ← create / edit one group
│   ├── GroupIdentityFields            ← title + description (labels from context)
│   ├── PhotoCaptureBar                ← Take Photo · Add Photos (wrap ImageSourceButtons)
│   ├── PhotoThumbnailGrid             ← review, reorder affordances
│   └── GroupSaveBar                   ← Save Area · Cancel
├── PhotoFullscreenViewer              ← evolve from AreaPhotoViewer
│   ├── Filmstrip / Prev / Next
│   ├── Rotate
│   ├── CaptionEditor
│   ├── Annotate (entry only in P2; tool in P2E)
│   ├── Delete / Replace
│   └── SecurityStatusChip             ← Local / Uploading / Uploaded / Failed
├── AfterGroupSavedPrompt              ← Add Another Area · No More Areas — Continue
└── PhotoWorkspaceProvider             ← in-memory model + upload queue + adapters

lib/photo-workspace/ (new modules — when coding starts)
├── model.js                           ← EvidenceGroup + EvidencePhoto (neutral)
├── contexts.js                        ← user-facing labels per report type
├── upload-queue.js                    ← state machine
├── image-pipeline.js                  ← EXIF / rotate / derivatives
└── adapters/
    ├── diary-report-photos.js         ← report_photos + overlays
    ├── jsonb-photos.js                ← survey / progress / hs
    └── snag-photo.js                  ← snag item association
```

**UI copy (explicit labels, not icon-only):**

Take Photo · Add Photos · Add Caption · Rotate · Delete Photo · Save Area · Add Another Area · Continue Report (or “No More Areas — Continue”).

---

## 3. Neutral reusable data model

### 3.1 Naming

| Layer | Name | User-facing |
|-------|------|-------------|
| Parent record | **Evidence Group** | Work Area / Survey Area / Progress Area / Snag Item / Inspection Area / Hazard |
| Child record | **Evidence Photo** | Photo (numbered in output only) |

Avoid exposing: `report_photos`, UUID, INSERT/UPDATE, storage path, `overlay_path`.

### 3.2 Evidence Group

| Field | Purpose |
|-------|---------|
| `id` | Stable client + server id |
| `reportId` | Owning report |
| `reportType` | `diary` \| `survey` \| `progress` \| `snag` \| `healthSafety` |
| `sectionKey` | e.g. `work_photos`, `survey_evidence` |
| `contextType` | `work_area` \| `survey_area` \| `progress_area` \| `snag_item` \| `inspection_area` \| `hazard` |
| `title` | Area / location / item name |
| `description` | Notes for the group (work / observation / defect / hazard) |
| `displayOrder` | Order among groups |
| `layout` | `full` \| `grid4` \| `grid6` (photos per page for this group) |
| `completionState` | `draft` \| `saved` \| `incomplete` |
| `createdAt` / `updatedAt` | Audit |

**Label mapping (shared architecture, different words):**

| Report | Add button | Group title placeholder |
|--------|------------|-------------------------|
| Site Diary | Add Work Area | e.g. Level 2 corridor |
| Site Survey | Add Survey Area | e.g. North elevation |
| Site Progress | Add Progress Area | e.g. Block A frame |
| Site Snag List | Add Snag Item | e.g. Flat 12 — bathroom tile |
| Site H&S | Add Inspection Area / Add Hazard | e.g. Scaffold ladder access |

### 3.3 Evidence Photo

| Field | Purpose |
|-------|---------|
| `id` | Stable id |
| `groupId` | Parent evidence group |
| `reportId` | Denormalised for queries / upload paths |
| `sectionKey` | Same as group |
| `displayOrder` | Order within group |
| `caption` | Optional; user-authored |
| `rotationDegrees` | 0 / 90 / 180 / 270 (manual + post-EXIF) |
| `orientationApplied` | Whether EXIF normalize already baked into display file |
| `originalRef` | Storage path or local blob key for original |
| `displayRef` | Path/key for upright / rotated display derivative |
| `thumbnailRef` | Small preview derivative |
| `annotationDoc` | Non-destructive JSON (existing shape model) |
| `annotationOverlayRef` | Transparent PNG overlay path (optional) |
| `uploadState` | See §4 |
| `saveState` | `unsaved` \| `linked_to_group` \| `linked_to_report` |
| `errorMessage` | User-safe failure text |
| `createdAt` | Capture time (not default caption) |

**Ownership invariants:** every photo belongs to **one report**, **one section**, **one evidence group**, **one display order**.

### 3.4 Mapping to today’s in-memory model

Current `locationWalk` area-groups (`lib/ai-annotation/area-groups.js`) already approximate this:

- group ≈ Evidence Group (`areaName`, `layout`, `photos[]`)
- photo ≈ Evidence Photo (`acceptedDescription`, `annotations`, `overlayPath`, `file`/`preview`)

**Recommendation:** Treat today’s area-group shape as the **V1 in-memory contract**; rename/extend fields toward Evidence Group/Photo without forcing users to see new jargon.

---

## 4. State model

### 4.1 Photo upload / security states

| State | Meaning | User sees |
|-------|---------|-----------|
| `local_only` | On device only (blob / IndexedDB) | “On this phone — not uploaded yet” |
| `queued` | Waiting to upload | “Waiting to upload…” |
| `uploading` | Transfer in progress | “Uploading…” |
| `uploaded` | File in storage | “Uploaded” |
| `failed` | Upload error | “Upload failed — Tap to retry” |
| `saved_to_report` | Linked by report/area save | “Saved with this report” |

**Critical distinction:**

| Phrase | Means |
|--------|--------|
| Upload complete | Bytes reached `site-photos` |
| Area saved | Evidence group + photo links + order persisted for this report draft/edit |
| Report saved | Full report finalize (e.g. Save Site Diary) succeeded |

Never show a bare “Saved” without saying **what** was saved.

### 4.2 Group lifecycle

`editing` → `saving` → `saved` → (optional) `editing` again  
Cancel unsaved area → discard draft photos (confirm if any photos present).

### 4.3 Proposed success / failure copy (exact)

| Event | Message |
|-------|---------|
| Photo added (local) | “Photo added to this area. It uploads when you Save Area or when upload finishes.” *(V1 may shorten once queue behaviour is fixed)* |
| Upload complete | “✓ Photo uploaded.” |
| Area saved | “✓ Area saved. Add another area or continue your report.” |
| Report saved | “✓ Your Site Diary has been saved.” (existing diary wording) |
| Upload failed | “We couldn’t upload this photo. Check your connection and tap Retry.” |
| Area save failed | “We couldn’t save this area. Check your connection and try Save Area again.” |

---

## 5. V1 action set (essential)

| Action | V1 |
|--------|----|
| Take Photo | Yes |
| Add Photos (multi) | Yes |
| Area name + description | Yes |
| Thumbnail review | Yes |
| Full-screen open | Yes |
| Previous / Next | Yes |
| Rotate 90° L/R | Yes |
| Caption add/edit | Yes (optional) |
| Delete photo | Yes (with confirm) |
| Reorder within area | Yes (simple up/down or drag if already reliable) |
| Save Area | Yes |
| Add Another Area / Continue | Yes |
| Cancel unsaved area | Yes (confirm if photos exist) |
| Retry failed upload | Yes |
| Preserve areas on revisit | Yes (after persistence — P2A/P2D) |
| Replace photo | Yes if low risk (clear annotations; keep slot/order) |

---

## 6. Deferred actions (later)

| Action | Phase |
|--------|--------|
| Full annotation drawing tools | P2E |
| Undo delete (soft-delete / trash) | After P2C |
| Full offline-first sync | After P2D |
| AI auto-captions | Later (API exists; UI stubbed) |
| Voice dictation polish | Later (hook already exists) |
| Dimension line / highlight tools | Annotation milestone |
| Crop as default framing | Never default; optional later |
| Destructive in-place recompress of original | Avoid |

---

## 7. Upload and resilience strategy

### V1 (essential) — P2D

1. **On capture:** create local Evidence Photo (`local_only`), show thumbnail immediately.  
2. **Background upload** when online (or on Save Area): `queued` → `uploading` → `uploaded`.  
3. **Save Area:** persist group metadata + photo ids/order + uploaded refs; mark `linked_to_group`.  
4. **Report save:** existing report finalize (diary unchanged); mark `saved_to_report`.  
5. **Retry:** per-photo Retry on `failed`.  
6. **Refresh / accidental navigate:**  
   - **V1 minimum:** warn if unsaved area has local photos; prefer persisting **uploaded** refs + group draft to the report row/adapter as soon as Save Area runs.  
   - **V1 stretch:** IndexedDB blob cache for `local_only` files keyed by report id (so refresh doesn’t lose unuploaded captures).  
7. **Large batches:** queue with concurrency limit (e.g. 2); don’t block UI.

### Later — full offline

- Service worker / durable queue across sessions  
- Conflict rules if same report edited on two devices  

**Today’s gap (must fix in P2):** Area save in diary/survey is largely **in-memory until full report save**. Snags already upload earlier via `onAreaSaved`. Shared Photo Workspace must make **Save Area** meaningful for security, not only UI phase change.

---

## 8. Image processing strategy

### Principles

- Prefer **non-destructive** originals in storage when practical  
- Display and PDF use an **upright display derivative**  
- Avoid repeated re-encode loops  

### Pipeline (proposed)

1. **Ingest:** read EXIF orientation (`lib/image-orientation.js` already exists for OCR — **wire into photo capture in P2B/C**).  
2. **Normalize once** into display pixels (or store `orientationApplied` + rotation).  
3. **Manual rotate:** update `rotationDegrees`; regenerate display/thumbnail derivatives; do not trash original bytes if kept.  
4. **Upload:**  
   - **Original** (or single high-quality upright master) for evidence  
   - **Thumbnail** (~400–800 px edge) for grids  
   - **Display** (~1600–2048 px edge) for fullscreen / PDF contain-fit  
5. **Caps (practical starting points — tune in build):**  
   - Reject / warn above ~12–15 MB before process  
   - JPEG quality ~0.82–0.88 for display derivative  
   - HEIC: convert on client where supported, else clear “format not supported”  

### Irreversible compromises (stated)

- If device cannot retain full original + derivatives, **keep upright master ≤ ~2048 px** and state that archival full-res is deferred.  
- Do **not** silently downscale below readable site detail for PDF without documenting the limit in UI settings later.

### Orientation bugs (current)

- `lib/image-orientation.js` is **not** used by Location Walk capture today.  
- Previews use raw object URLs → sideways photos possible.  
**P2 must** apply orientation at ingest and ensure PDF uses the same upright source the user reviewed.

---

## 9. Annotation integration boundary

**Do not build the drawing tool in P2A–D.** Establish seams only.

### Entry / return

```text
Fullscreen photo
  → Annotate
       → PhotoAnnotationEditor (existing)
       → returns { annotationDoc, overlayDataUrl }
  → back to fullscreen with overlay visible
  → Save Area / Report persists annotationDoc + overlay ref
```

### What to establish now

| Requirement | Approach |
|-------------|----------|
| Preserve original | Never draw into original file; keep `originalRef` / `url` |
| Non-destructive annotations | Keep structured JSON (`lib/photo-annotations/model.js` v1 shapes) |
| Annotated output | Optional `annotationOverlayRef` PNG; PDF composites via existing `composite.js` |
| Dirty flag | Keep `overlayDirty` (or equivalent) until uploaded |
| Future tools | Model already has arrow, ellipse, rect, freehand, text; add highlight / dimension later as new shape types **without** changing storage ownership |

### Existing editor

Retain `PhotoAnnotationEditor` / `PhotoAnnotationViewer` / `lib/photo-annotations/*` as the annotation subsystem behind the Photo Workspace fullscreen “Annotate” action (P2E).

---

## 10. Report-output boundary

### Layouts (later PDF / print)

- 1 / 4 / 6 photos per page  
- Equal frames, **contain** (never crop by default)  
- Preserve orientation  
- Caption in or under frame  
- User order preserved  
- Automatic **Photo 1…N** in output (unobtrusive during capture — do not force “Photo N” as the caption field)

### Where layout is chosen — recommendation

**At evidence-group (area) level** — already how diary Location Walk works (`layout` / per-page on the area).

**Why:**

- Different areas need different density (one wide elevation vs many detail shots)  
- Matches locked user flow (choose layout while building the area)  
- Existing PDF scheduler (`lib/photo-schedule.js`) already buckets by layout tier  

Report-level default template can exist later as a **default for new areas**, not as the only control.

**PDF generation:** out of scope for P2 implementation; workspace must **store** `layout` + order + captions + upright refs so PDF can consume them without rework.

---

## 11. Existing code reuse plan

### Retain (core)

| Asset | Role |
|-------|------|
| `components/ai-annotation/AiLocationWalk.jsx` | Evolve into / wrap as PhotoWorkspace orchestrator |
| `lib/ai-annotation/area-groups.js` | In-memory group/photo model → Evidence Group/Photo |
| `components/ImageSourceButtons.jsx` | Take / Add Photos |
| `components/ai-annotation/AreaPhotoViewer.jsx` | Basis for fullscreen |
| `components/photo-annotations/*` + `lib/photo-annotations/*` | Annotation boundary |
| `lib/photo-schedule.js` + `DiaryPdfDocument` patterns | Output layout later |
| `lib/image-orientation.js` | Wire into capture |
| `lib/ai-annotation/persist.js` `uploadAnnotationImage` | Path builder for non-diary |
| Diary overlay upload pattern | Extend for shared overlays |
| `lib/ai-annotation/contexts.js` | Label / prompt registry (extend for group labels) |

### Deprecate / absorb (do not invest further)

| Asset | Reason |
|-------|--------|
| `components/location-walk/LocationWalkCapture.jsx` | Alias only |
| `AnnotationPendingReview`, `AnnotationSavedList`, `AnnotationPhotoCard`, `AnnotationLocationBar`, `CurrentAreaProvider` | Legacy parallel UX |
| `lib/describe-photo.js` / old describe API path | Superseded by ai-annotate; captions manual in V1 |

### Technical risks in current code

1. **Three persistence models** — `report_photos` vs JSONB `photos` vs `snags.photo_url`  
2. **Area save ≠ durable save** for diary/survey until report save  
3. **Orientation** not applied on walk capture  
4. **JSONB path drops annotations/overlays** today  
5. **Schema drift** (`url`/`sequence` live vs older migration names)  
6. **No IndexedDB** for local photo blobs  
7. `contextId` passed but unused by `AiLocationWalk`  
8. AI caption UI stubbed  

### Can present data model support the shared workspace?

**In-memory: yes** (area-groups is the right shape).  
**Persistence: partially** — diary relational model is closest to Evidence Group + Evidence Photo; JSONB and snag single-url are incomplete for multi-photo + overlays. Adapters can ship V1 without a new table if we accept JSONB limits; a proper shared table is cleaner mid-term (see §12).

---

## 12. Likely schema changes (future — not now)

**None required to start P2A UI** against in-memory + existing diary `report_photos`.

**Likely later (minimal, when hardening multi-type persistence):**

| Option | Pros | Cons |
|--------|------|------|
| **A. Shared `evidence_groups` + `evidence_photos` tables** | True reuse across report types | Migration + backfill; careful RLS |
| **B. Keep per-type stores + adapters** | Less migration risk | Forever three writers; JSONB weak for overlays |
| **C. Hybrid** — diary stays `report_photos`; new shared tables for survey/progress/hs/snags | Incremental | Two systems temporarily |

**Recommendation:**  

- **P2A–C:** no schema change; diary continues via `report_photos`; improve in-memory + upload queue.  
- **P2D:** decide A vs C before Survey/Progress need parity with diary overlays.  
- Optional columns if staying on `report_photos`: `rotation`, `group_id`, `upload` metadata — only if diary adapter needs them and live allowlist is updated carefully (**never** break M0 allowlist blindly).

**Do not alter tables in this planning phase.**

---

## 13. Risks

| Risk | Mitigation |
|------|------------|
| Breaking diary save while extracting photos | Photo Workspace talks to diary through flatten → existing save loop; no change to `finalizeSiteDiarySave` contract |
| Users think Area Saved = Report Saved | Exact copy + separate states (§4) |
| Orientation regressions | Single pipeline; PDF uses same display ref as viewer |
| Losing photos on refresh | P2D IndexedDB or earlier Save Area persistence |
| Forcing snags into “work areas” | Context labels; same model, different words |
| Scope creep into annotation/PDF | Hard phase gates P2E / P2F |
| JSONB cannot store overlays | Adapter honesty + schema option later |
| Large batches kill mobile memory | Concurrency limits; revoke object URLs; thumbnail-first |

---

## 14. Proposed implementation phases

| Phase | Scope | Out of scope |
|-------|--------|--------------|
| **P2A** | Evidence Group model (from area-groups), context labels, list + create group identity, Save Area as durable *intent* API (diary: still may sync on report save initially, with clear copy) | Annotation tools, PDF, schema migrations |
| **P2B** | Take Photo / Add Photos, thumbnails, multi-select gallery, orientation at ingest | Fullscreen editing suite |
| **P2C** | Fullscreen viewer, prev/next, caption, rotate, delete, replace, reorder | Soft-delete undo, AI captions |
| **P2D** | Upload queue states, retry, interruption recovery, IndexedDB stretch, area vs upload vs report messaging | Full offline multi-device sync |
| **P2E** | Annotate entry/return via existing editor; persist overlay non-destructively for diary; plan JSONB gap | New drawing tools beyond current editor |
| **P2F** | Layout integration for report/PDF consumption (1/4/6), Photo N numbering in output | New PDF product features beyond existing diary patterns |

**Dependency:** Shared Report Workspace shell stays **frozen**; Photo Workspace is built so the future shell’s `WorkPhotosSection` is a thin host around this workspace.

---

## Captions (summary)

- Optional, per image, editable, shown in output  
- No automatic timestamps as default caption  
- Report date remains the report’s date  
- Output may show **Photo 1…N** automatically; input UI should not require typing that  

---

## Existing code review checklist (answers)

1. **Components:** AiLocationWalk, AreaPhotoViewer, ImageSourceButtons, PhotoAnnotationEditor/Viewer, legacy Annotation* / LocationWalkCapture  
2. **Upload utils:** diary save loop, `uploadAnnotationImage` / `persistAnnotationItems`, overlay PNG upload  
3. **Location walk:** AiLocationWalk phases create / after_save / review  
4. **Annotation:** photo-annotations model + editor; overlays on diary only today  
5. **Storage:** private `site-photos`; paths `{userId}/{reportId|projectId}/…`  
6. **Retain:** see §11  
7. **Deprecate:** legacy Annotation* / LocationWalkCapture / unused describe path  
8. **Risks:** §13 + three persistence models + in-memory area save  
9. **Support shared workspace?** In-memory yes; persistence needs adapters (+ likely schema later)  
10. **Minimal future schema:** evidence_groups/photos or hybrid — after P2D decision  

---

## Implementation status

| Phase | Status |
|-------|--------|
| **P2A** — core workspace foundation, Evidence Group model, contexts, adapters, Site Diary host | **FROZEN — ready for commit** |
| **P2B** Part 1 — camera capture + thumbnail grid (preview / delete / rotate) | **IN PROGRESS** |
| P2B Part 2+ — multi-upload hardening, orientation ingest | Not started |
| P2C — fullscreen viewer suite | Not started |
| P2D — upload queue / retry / interruption | Not started (no IndexedDB in V1) |
| P2E — annotation integration | Not started |
| P2F — report-layout integration | Not started |

### P2A architecture decisions (approved 2026-08-06)

1. **Adapters only** — no shared `evidence_*` tables yet.
2. **No IndexedDB** — online-first; clear save/upload states; beforeunload warning for unsaved create-flow.
3. **Do not modify** Site Diary `finalizeSiteDiarySave`, auth, or routing.
4. **Prove in Site Diary first** before Survey / Progress / Snag / H&S reuse.

### P2A UX freeze (wording)

- Section title (all report types): **Photo Evidence**
- Area/item notes label: **Notes for this area** (snag: **Notes for this item**); placeholders adapt per report type
- Do not reopen P2A scope; start P2B only after explicit approval.
