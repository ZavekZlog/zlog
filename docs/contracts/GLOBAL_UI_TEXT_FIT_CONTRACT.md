# Global UI Contract — Intentional Design & Visual QA

**Layer:** Global UI  
**Version:** 1.1.1  
**Date Updated:** 2026-08-07  
**Reason Updated:** Require visual verification of every visible control/label/placeholder/button/dialog/toast/dropdown/validation/navigation on mobile before screen complete  
**User Decision:** No screen complete until full mobile visual verification of all visible UI elements  
**Previous Version:** 1.1.0

Parent: `docs/ZLOG_PRODUCT_CONSTITUTION.md`  
Also enforced by: `.cursor/rules/commercial-product-governance.mdc`, `.cursor/rules/zlog-ux-clarity.mdc`

---

## Principle

All visible UI must appear **intentionally designed** on supported devices. A screen that looks unfinished, broken, or accidental is a product defect.

---

## 1. Text must always fit

Every visible piece of UI text must fit within its intended container on supported mobile devices.

### Applies to

Page titles · section headings · labels · placeholders · helper text · validation messages · buttons · menus · cards · dialogs · tooltips · navigation · status banners

### Never acceptable

- Clipped text  
- Truncated text without intent  
- Text extending outside a container  
- Overlapping text  
- Hidden text  
- Horizontal scrolling to read text  
- Users having to guess missing words  

### Remedies (choose one)

1. Rewrite shorter (**preferred**)  
2. Allow wrapping where appropriate  
3. Increase the component size  
4. Redesign the layout  
5. Redesign the component if required  

**Do not** simply clip or truncate text.

---

## 2. Intentional layout (no unfinished UI)

On supported mobile viewports, the following are **never acceptable**:

- Overlapping controls  
- Inconsistent spacing  
- Cropped icons or images  
- Controls extending outside containers  
- Layout shifts that make the UI appear unfinished  

If any of the above occur, fix by adjusting layout, spacing, sizing, or redesigning the component — not by ignoring the defect.

---

## 3. Definition of done — visual QA

**No screen may be considered complete** until **every** visible:

- control  
- label  
- placeholder  
- button  
- dialog  
- toast  
- dropdown  
- validation message  
- navigation element  

has been **visually verified** on the supported mobile viewport(s).

That review must confirm:

- No clipped or truncated text (without intentional, readable truncation design)  
- No overlapping controls  
- No inconsistent spacing that looks broken  
- No cropped icons or images  
- No controls outside containers  
- No unfinished-looking layout shifts  

Any failure is a **regression** and blocks feature completion.

Completion reports for UI work must state that **mobile visual QA** was performed against the full visible element set above and **passed**.

