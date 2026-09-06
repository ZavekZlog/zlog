# Protected Product Decisions & Regression Contract

**Version:** 1.4.0
**Date Updated:** 2026-09-06
**Reason Updated:** Site Diary UX / PDF audit — approved specification recorded (Phase 0)
**User Decision:** APPROVED — architecture map with Deliveries, transactional refs, labour date filter unchanged
**Previous Version:** 1.3.0

**Status:** Binding product decisions for commercial Zlog (not a prototype)  
**Purpose:** Prevent regressions and premature feature builds. Agents and contributors must treat these as frozen unless the user explicitly revises them.

## Contract hierarchy

| Layer | Document |
|-------|----------|
| 0. Constitution | **`docs/ZLOG_PRODUCT_CONSTITUTION.md`** — **ZLOG_PRODUCT_CONSTITUTION v1.3 (FROZEN)**; no casual Principle 8+ |
| 0b. Global UI | **`docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`** — intentional design + text fit + mobile visual QA |
| 0c. Release Gate | **`docs/ZLOG_RELEASE_GATE.md`** — mandatory Visual/Mobile/Functional/Regression/UX/Commercial QA |
| A. Product (this file) | Global decisions across Zlog |
| B. Screen | `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md` |
| C. Feature | `docs/contracts/PROJECT_MODEL_CONTRACT.md`, `REPORT_BRANDING_CONTRACT.md`, `PHOTO_WORKSPACE_CONTRACT.md` |
| Index | `docs/contracts/README.md` |
| Product backlog | **`docs/ZLOG_PRODUCT_BACKLOG.md`** |
| Gaps pending approval | `docs/contracts/PENDING_APPROVAL_GAPS.md` — **do not silently fix** |

**Process:** Product Constitution binding; no silent behaviour change; classify change type; Impact Assessment for existing workflows; change levels 1–4; feature freeze; contracts append-only unless explicitly approved; UI gate `npm run test:site-diary-contract`. See `.cursor/rules/commercial-product-governance.mdc`.

---

## A. Site Diary save & routing (must not regress)

| Decision | Contract |
|----------|----------|
| Final save | `finalizeSiteDiarySave` — UPDATE-only by report id; verify SELECT |
| Open today’s existing diary | `openExistingDiaryHref` → populated Project & Report Details → same report in `?compose=1` |
| Start today’s diary from a previous one | Opened saved diary **Use as Basis for New Diary** → `createTodaysDiaryDraft` → `projectAndReportDetailsHref` for the new diary → `?compose=1` |
| Open historical diary | `?report=` on `/dashboard/project/{projectId}/diary` via `existingDiaryHref` |
| Never | Create a replacement diary when opening a selected existing record |
| Hub copy | Dashboard → `/dashboard/diary`; “Start a new diary” / “Use a previous diary” (site language; no implementation terms) |
| Docs | `docs/M0_SAVE_LIFECYCLE.md`, `lib/diary-routing.js` |
| Site Diary UX / screen | **`docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`** + `docs/PROTECTED_SITE_DIARY_CONTRACT.md`; gate `npm run test:site-diary-contract` |
| Shift options | **Day / Back / Night** (authoritative; supersedes older Weekend / Half day listings in draft specs) |

---

## B. Shared workspaces (sequencing)

| Decision | Contract |
|----------|----------|
| Photo Workspace before report shell | Do not implement Shared Report Workspace shell until Photo Workspace is proven |
| Photo Workspace P2A | Adapters only; no shared evidence tables yet; no IndexedDB in early P2 |
| Docs | `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md`, `docs/SHARED_REPORT_WORKSPACE_ARCHITECTURE.md` |

---

## C. Progress Report — Project Programme (approved; not for build yet)

**Protected product decision:**

> The Progress Report will eventually allow a project programme or Gantt chart to be uploaded once, reused in weekly reports, marked with a progress date line and annotated to show completed, ongoing and delayed work. The original programme must remain unchanged.

| Constraint | Contract |
|------------|----------|
| Classification | Future **Progress Report premium** feature |
| Not Photo Workspace | Must not be built as part of P2 Photo Workspace milestones |
| No implementation now | Do not schedule or code PR1–PR8 until explicitly approved |
| Project Start Date | Project-level — entered once; not re-entered per daily report |
| Planned Completion Date | Project-level — entered once; not re-entered per daily report |
| **Project Day No.** | **Approved.** Calculated automatically from Project Commencement Date and Project Completion Date. Elapsed programme time only — **not** % complete. Displayed on Site Diary when dates exist. Label supersedes **Project Day**. Progress Report Gantt / mark-up remains future premium work. |
| Planned Days Remaining | Derived automatically alongside Project Day |
| Calendar vs working days | Must be resolved **before** PR2 implementation |
| Original programme | Immutable; weekly mark-ups are separate non-destructive versions |
| UI language | Progress Date Line, Progress Drop-Line, Mark Up Programme — no technical jargon in UI |
| Status colours | Green / Amber / Red communicate Complete / In Progress / Delayed–At Risk only |
| Site Diary Project Day No. | **Implemented display** on Site Diary when programme dates exist (live copy may still say Project Day until the authorised label phase). Do not remove without explicit approval. Progress Report programme upload remains future work. |
| Calendar day basis (V1) | Initial Project Day uses **calendar days** (`lib/project-day.js`). Working-days mode not implemented. |
| Spec | `docs/PROGRESS_REPORT_PROGRAMME_ARCHITECTURE.md` |
| Roadmap | PR1–PR8 in `docs/PRODUCT_ROADMAP.md` |
| Backlog | `docs/PREMIUM_FEATURE_BACKLOG.md` |

### Regression contract (future coding)

When Progress Programme work is authorised:

1. Do not overwrite the original uploaded programme.  
2. Do not require weekly re-upload unless a revised programme is issued.  
3. Do not present Project Day as physical completion %.  
4. Do not require daily manual entry of Project Day — it must be calculated automatically from project dates.  
5. Do not merge programme markup into the Photo Workspace evidence model without an explicit architecture decision.  
6. Do not break Site Diary save / open-existing routing while adding project dates.

---

## E. Site Diary audit — approved specification (2026-09-06)

**Phase 0 records the specification. Implementation is subsequent authorised phases. This is not a declaration that the live PDF is complete.**

| Decision | Contract |
|----------|----------|
| Setup hierarchy | `SITE_DIARY_SCREEN_CONTRACT.md` §2 — Name adjacent to Reference; Cover after Principal Contractor; **Continue to Today's Report** |
| Labels | Project Commencement Date; Project Completion Date; Project Day No.; Project Week No.; Reporting Organisation; Shift Pattern; Author of Diary |
| Cover management | Neutral **Change or remove cover photo**; red only on confirmed Remove |
| Compact IA | Compact workbench header; utilitarian rows; later visual system must not inflate; company `brand_color` authoritative |
| Red rule | Routine Edit/Remove/Change are neutral |
| Weather | Conditions + numeric Temperature with built-in °C |
| H&S / RFI / VAR UX | Save → compact row; deliberate + Add another; no automatic blank second form |
| Project-level refs | `H&S-001` `RFI-001` `VAR-001` `Delay-001` `LP-001` `DEL-001` — database-transaction allocated; external refs separate |
| Deliveries | First-class project records with status (Delivered / Part delivered / Delivery refused / Unable to offload) **before** DEL↔LP↔H&S↔Delay links |
| Labour | Only matching diary-date rows eligible by default; do not import other dates |
| PDF | Populated workbench data must flow into PDF; company branding authoritative; PHOTO-001; 1/4/6 layouts; no empty caption clutter |
| Branding | Do not replace reporting-company colour with diary violet or Zlog orange |

---

## D. Landing & UX clarity

| Decision | Contract |
|----------|----------|
| Landing page | Locked |
| UX clarity | `.cursor/rules/zlog-ux-clarity.mdc` |

---

*Updating this file requires an explicit product approval. Documentation-only changes that add new protected decisions must quote the approval in the commit message when committed.*
