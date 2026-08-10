# Report Branding Contract

**Layer:** C — Feature  
**Version:** 1.0.0  
**Date Updated:** 2026-08-07  
**Reason Updated:** Initial feature contract for report branding association  
**User Decision:** Governance hardening — report branding contract  
**Previous Version:** none  

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

Setup exposes **Company / Client Logo** (upload / replace / remove) and stores paths/ids onto the draft on Continue — not onto `public.projects`.
