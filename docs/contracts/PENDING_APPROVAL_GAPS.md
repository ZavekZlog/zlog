# Pending approval gaps (do not silently fix)

**Version:** 1.2.0  
**Date Updated:** 2026-09-06  
**Reason Updated:** Close setup-hierarchy gaps against the 2026-09-06 Site Diary audit specification  
**User Decision:** APPROVED — Phase 0 contracts; implementation later  
**Previous Version:** 1.1.0  

**Rule:** List mismatches against approved contracts here. Fix **only** after explicit user approval of each item. Track the same items in **`docs/ZLOG_PRODUCT_BACKLOG.md`** (ZLOG-001 … ZLOG-010).

Governance pass audit of current Site Diary vs `SITE_DIARY_SCREEN_CONTRACT.md` / ownership contracts:

| ID | Area | Mismatch | Suggested direction (needs approval) |
|----|------|----------|--------------------------------------|
| G1 | Setup sectioning | **Closed (2026-09-06).** Locked hierarchy is `SITE_DIARY_SCREEN_CONTRACT.md` §2. Live UI may still show the pre-audit sectioning until the authorised implementation phase. | Implement the locked stack; do not treat live 1.21.0 order as approved |
| G2 | Project Reference ownership | Contract: project-level on `public.projects`. Column `project_reference` now exists; setup must keep it immediately beneath Project Name. | Implementation phase: adjacency + compact table |
| G3 | Select existing project | ~~Prefill from latest diary~~ **Closed** with Project Name select-or-create (sticky only). | Sticky + programme only |
| G4 | Project Day on setup | **Closed (2026-09-06).** Approved labels are **Project Day No.** / **Project Week No.** as derived context, not a setup input. | Implementation: label rename; keep calculation |
| G5 | Cover Photo on setup | **Closed (2026-09-06).** Cover is in the locked setup hierarchy after Principal Contractor. Neutral **Change or remove cover photo**. | Implementation phase |
| G6 | Project Description | Listed historically; not in the locked 2026-09-06 setup stack; not in schema / UI. | Keep omitted until schema approved |
| G7 | Diary form Shift label | ~~Setup uses **Shift**; diary form uses **Shift type**.~~ Resolved: Shift is setup-only; workbench shows read-only shift context (no editable Shift type). Approved setup label is **Shift Pattern**. | Implementation: label rename |
| G8 | Older docs | `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` still mentions Day / Night / Weekend / Half day in places. Newer decision: Day / Back / Night. | Mark superseded in spec (doc-only) |
| G9 | Older product note | **Closed (2026-09-06)** in `PROTECTED_PRODUCT_DECISIONS.md` — Project Day No. is approved derived display. | — |
| G10 | Hub mode title | Mode title **“Start New Report”** vs CTA **“Start New Site Diary”**. | Align wording if desired |

**Authoritative for Shift options:** Day / Back / Night (newer user decision).
