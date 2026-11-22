# Report Branding Contract

**Layer:** C — Feature  
**Version:** 1.2.0  
**Date Updated:** 2026-11-22  
**Reason Updated:** Issued PDF banner and top lines follow the locked design rules; the resolvePdfAccent rewrite is no longer the PDF rule  
**User Decision:** APPROVED — do not replace company branding with diary violet or Zlog orange. APPROVED — the issued PDF follows docs/ZLOG_PDF_DESIGN_RULES.md sections 4 and 12  
**Previous Version:** 1.1.0  

**Status:** Binding for implemented Site Diary branding  

Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Screen: `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`

---

## Ownership

Branding association is **report-level** on `daily_reports`:

- `branding_id`
- `brand_color`
- `brand_logo_url`

Company profiles live in `company_brandings` (user-owned). A profile may be marked default for **new** setup defaults only.

---

## Rules

1. **Existing diary branding remains attached** when opening View/Edit.
2. **Normal Edit mode must not force branding reconfirmation** — no full `BrandingSelector` unless the user takes an explicit change action (`shouldShowBrandingSelector({ hasReportId: true, allowChangeBranding: false })` → false).
3. **Start from scratch** may load an explicit **default** company profile for logo/colour — not branding copied from the last opened diary.
4. **Use as Basis** may carry approved reusable branding fields from the source diary into the **new** diary ID only.
5. Changing branding requires a **separate explicit** user action.

---

## Setup

Setup exposes **Reporting Organisation** name and logo (upload / replace / remove) and stores paths/ids onto the draft on Continue — not onto `public.projects`. Live setup copy may still say Reporting Company until the authorised implementation phase.

## Colour authority (2026-09-06)

Reporting-company colour comes from `company_brandings.brand_color` snapshotted onto `daily_reports.brand_color` (with `brand_logo_url` / `branding_id`). On the issued PDF, `docs/ZLOG_PDF_DESIGN_RULES.md` sections 4 and 12 apply:

- The banner uses the reporting company's sampled brand colour exactly, on every page, whatever the hue (red, white, silver and pink included).
- If no branding exists at all, the banner uses the default neutral grey `#6E6E6E`.
- Table top lines and section top rules use the sampled brand colour exactly, with no rewriting or clamping. Pigeon grey `#E4E2DE` is used only for a red-dominant brand, a brand lighter than luminance 0.30, and no branding.
- Branding is sampled only from the reporting company, never the end client.
- Red may appear only in the header banner area (banner or logo), nowhere below it.

That company colour remains **authoritative** for the redesigned app compact IA. On the PDF it colours the banner, and the table and section top lines where the rules above allow it. It does not colour the page frame, section titles, labels, grid, footer, or cover name.

Do **not**:

- invent a replacement palette
- paint report chrome with diary module violet (`REPORT_THEMES.diary` / `#8B5CF6`)
- paint report chrome with Zlog orange (`#FF5000` / `--action`)

Zlog identity stays secondary (compact workbench wordmark; PDF footer **Produced with Zlog**). Dashboard branding may remain stronger.

Later presentation work must apply the reporting-company colour to the compact redesigned structure without inflating it.
