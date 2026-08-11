# Pending approval gaps (do not silently fix)

**Version:** 1.1.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Mirror open items into living product backlog  
**User Decision:** Final governance pass — change control and product backlog  
**Previous Version:** 1.0.0  

**Rule:** List mismatches against approved contracts here. Fix **only** after explicit user approval of each item. Track the same items in **`docs/ZLOG_PRODUCT_BACKLOG.md`** (ZLOG-001 … ZLOG-010).

Governance pass audit of current Site Diary vs `SITE_DIARY_SCREEN_CONTRACT.md` / ownership contracts:

| ID | Area | Mismatch | Suggested direction (needs approval) |
|----|------|----------|--------------------------------------|
| G1 | Setup sectioning | Shift, Author, Reporting, Report Date, Logo, and Project Reference all sit inside one GlassSection titled **“Project and date”**, mixing project-level and report-level UI. | Split sections to match contract headings without changing field order |
| G2 | Project Reference ownership | Contract: project-level on `public.projects`. Impl: session extras keyed by report id (`lib/report-setup.js`), not a projects column. | Approve column + migrate, or reclassify as report-level |
| G3 | Select existing project | ~~Prefill from latest diary~~ **Closed** with Project Name select-or-create (sticky only). | Sticky + programme only |
| G4 | Project Day on setup | Contract lists Project Day “where displayed”. Setup does not show it; diary Project card does. | Confirm setup omission is intentional |
| G5 | Cover Photo on setup | Contract: “where currently approved”. Cover exists on diary form, not setup. | Confirm setup omission is intentional |
| G6 | Project Description | Listed in sticky sequence; not in schema / UI. | Keep omitted until schema approved |
| G7 | Diary form Shift label | ~~Setup uses **Shift**; diary form uses **Shift type**.~~ Resolved: Shift is setup-only; workbench shows read-only shift context (no editable Shift type). | — |
| G8 | Older docs | `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` still mentions Day / Night / Weekend / Half day in places. Newer decision: Day / Back / Night. | Mark superseded in spec (doc-only) |
| G9 | Older product note | `PROTECTED_PRODUCT_DECISIONS.md` historically said not to add Project Day to Site Diary yet; diary Project card now shows Project Day (later approval). | Update product doc wording to match current approval |
| G10 | Hub mode title | Mode title **“Start New Report”** vs CTA **“Start New Site Diary”**. | Align wording if desired |

**Authoritative for Shift options:** Day / Back / Night (newer user decision).
