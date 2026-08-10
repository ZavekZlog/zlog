# Shared Report Workspace — Frozen Architecture

**Status:** APPROVED and FROZEN (2026-08-06)  
**Branch context:** `architecture-rebuild`  
**Baseline:** Site Diary M0 save / `?report=` UPDATE / session recovery is stable and must not be broken.

---

## Freeze rules

1. **Do not implement the shared report shell yet.**
2. **Next milestone:** Shared **Photo Workspace** (every report type will depend on it).
3. **Later:** Implement this Shared Report Workspace architecture using the Photo Workspace.
4. Site Diary final save remains `finalizeSiteDiarySave` + `lib/live-diary-schema.js` (UPDATE-only, allowlist, verify SELECT).
5. Prefer additive route swaps behind existing URLs; do not break diary hub / setup / editor / complete.

---

## Objective

One shared report workspace that will eventually support:

- Site Diary
- Site Survey Report
- Site Progress Report
- Site Snag List
- Site H&S Report

Site Diary is the reference implementation.

---

## Component hierarchy (approved)

```text
ReportWorkspaceShell
├── ReportIdentityHeader
├── ReportSectionHost
│   ├── shared sections (Branding, Summary, WorkPhotos, …)
│   └── type-specific sections (pluggable)
├── ReportSaveBar
└── ReportCompleteScreen

ReportTypeDefinition (config)
├── id, title, accent, routes
├── sections[]
├── saveAdapter (load / createDraft / finalizeSave)
└── copy
```

**Entry pattern (diary-proven):** ReportEntryHub → ReportSetup → ReportEditor → ReportComplete.

---

## Reuse

- `lib/premium-ui.jsx`, `lib/report-theme.js`
- `BrandingSelector`, `AiLocationWalk` (+ annotation libs)
- `lib/auth/return-path.js` session recovery pattern
- Diary hub / setup / complete as patterns (not forced rewrite)
- UX clarity rule: `.cursor/rules/zlog-ux-clarity.mdc`

**Do not genericise into shared save:**

- `lib/diary-save.js` → `finalizeSiteDiarySave`
- `lib/live-diary-schema.js`
- `lib/diary-draft.js`
- Diary-only domains: labour, plant, OCR, signature, equipment hire

---

## New pieces (when shell work starts — later)

- `ReportTypeDefinition` configs
- `ReportWorkspaceShell`, `ReportSectionHost`, section wrappers
- `reportSaveAdapters/*` (diary adapter = thin façade over `finalizeSiteDiarySave` only)
- Optional shared entry hub / complete parametrisation

---

## Routes

**Preserve:**

- `/dashboard/diary`, `/dashboard/diary/setup`
- `/dashboard/project/[id]/diary?report=`
- `/dashboard/project/[id]/diary/complete?report=`

**Evolve later (same URLs, new guts):**

- `/dashboard/project/[id]/site-survey`
- `/dashboard/project/[id]/weekly-report`
- `/dashboard/project/[id]/weekly-hs`
- `/dashboard/project/[id]/snags` (list-first; package editor later)

---

## Database

**No schema change required** for the shared workspace shell.

- Keep separate tables per report type.
- Do not introduce a polymorphic `reports` table in the first shell implementation.
- Photo persistence differences (relational `report_photos` vs JSONB `photos` vs snag `photo_url`) stay in adapters / Photo Workspace — not in a forced unified DB for M1.

---

## Preserving diary report-ID save

1. Final diary save stays `finalizeSiteDiarySave`.
2. Workspace calls `saveAdapter.finalize(reportId, …)`; diary adapter only forwards.
3. Final save requires report id; missing id fails loudly; no INSERT on final save.
4. Draft/create stays outside final save.
5. `lib/diary-save.test.js` and live-schema contracts must remain green.
6. Complete keeps `?report=<same id>`.

---

## Per-type section lists

Example shapes:

- **diary:** branding, project, authorCover, details, summary, labour, plant, equipment, visitors, delays, actions, workPhotos, signature  
- **survey / progress / hs:** branding, date, summary, workPhotos (extend later)  
- **snags:** list-first; not forced into diary-shaped editor initially  

---

## Risks (remember when implementing)

- Do not touch diary save while extracting UI.
- Extract incrementally; diary page is large.
- Photo model split — solve in Photo Workspace, not by breaking diary.
- Do not force `SimpleBrandedReportPage` through diary save.
- Live schema drift — keep diary on allowlists.
- Snags are a list product — separate design pass.

---

## Implementation phases (deferred until after Photo Workspace)

1. Extract diary chrome into shell; keep `finalizeSiteDiarySave` direct.  
2. Diary `ReportTypeDefinition`.  
3. First non-diary type (Survey or Progress) behind existing route.  
4. H&S.  
5. Entry hubs / complete parity if needed.  
6. Snags design pass.

---

## Next milestone (active)

**Shared Photo Workspace** — design complete in `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md`.  
Await approval before any Photo Workspace implementation.

Do **not** start Shared Report Workspace shell implementation until Photo Workspace is ready and this architecture is explicitly unfrozen for coding.

---

## Related future work (not this shell)

**Progress Report — Project Programme** (Gantt upload, Progress Date Line, Mark Up Programme) is a separate **premium** track. It is **not** part of the Shared Report Workspace shell milestone and must not be implemented until approved.

See: `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md`, `docs/PRODUCT_ROADMAP.md` (PR1–PR8), `docs/PROTECTED_PRODUCT_DECISIONS.md`.
