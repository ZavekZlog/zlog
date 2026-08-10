# Zlog Release Gate (Mandatory)

**Version:** 1.0.2  
**Date Updated:** 2026-08-07  
**Reason Updated:** Commercial QA includes Preserve User Trust (Constitution Principle 7)  
**User Decision:** Principle 7 – Preserve User Trust  
**Previous Version:** 1.0.1  

Parent: `docs/ZLOG_PRODUCT_CONSTITUTION.md`  
Global UI: `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`

---

**Principle**

**Working software is not the definition of done. Professional software is.**

**The burden of proof lies with change, not stability.** Existing approved behaviour is presumed correct until a documented product decision explicitly supersedes it.

No screen, feature, or workflow may be considered complete until **all** gates below have passed.

Never mark a feature complete because the code compiles.

If any item fails, status is:

> **NOT READY FOR RELEASE**

---

## 1. Visual QA

- [ ] No clipped, truncated or overflowing text  
- [ ] No overlapping controls  
- [ ] All labels fully visible  
- [ ] Placeholders fully visible  
- [ ] Buttons fully visible  
- [ ] Icons aligned  
- [ ] Images correctly scaled  
- [ ] Consistent spacing  
- [ ] Consistent typography  
- [ ] Consistent colours  
- [ ] No accidental horizontal scrolling  

## 2. Mobile QA

Must be tested on supported mobile viewport(s).

- [ ] Portrait  
- [ ] Landscape  
- [ ] Keyboard open  
- [ ] Keyboard closed  
- [ ] Smallest supported device  
- [ ] Largest supported phone  

## 3. Functional QA

Every control must function.

- [ ] Buttons  
- [ ] Dropdowns  
- [ ] Inputs  
- [ ] Date pickers  
- [ ] Upload buttons  
- [ ] Camera  
- [ ] OCR  
- [ ] Save  
- [ ] Continue  
- [ ] Back  
- [ ] Cancel  
- [ ] Error recovery  

(Verify only controls present on the screen under test; absent controls are N/A, not a pass.)

## 4. Regression QA

Verify existing behaviour remains intact.

Examples:

- [ ] Existing diary still opens  
- [ ] Blank diary still blank  
- [ ] Sticky project behaviour unchanged  
- [ ] Saved reports unchanged  
- [ ] Branding unchanged  
- [ ] OCR unchanged  
- [ ] Photos unchanged  
- [ ] Signatures unchanged  

## 5. UX QA

Ask:

- [ ] Can this screen be simplified?  
- [ ] Is every click necessary?  
- [ ] Is anything duplicated?  
- [ ] Is the next action obvious?  
- [ ] Would a Site Manager understand this instantly?  
- [ ] Is any wording confusing?  
- [ ] Is there unnecessary friction?  

## 6. Commercial QA

Ask:

- [ ] Does this feel premium?  
- [ ] Would this embarrass us in front of a paying customer?  
- [ ] Would this reduce confidence in the product?  
- [ ] Would this survive a product demo?  
- [ ] Does this **preserve or improve user trust** (no inconsistency, unnecessary friction, regressions, or unexpected behaviour)?  

---

## Completion rule

A feature is **NOT COMPLETE** until:

1. Visual QA passes  
2. Functional QA passes  
3. Mobile QA passes  
4. Regression QA passes  
5. UX QA passes  
6. Commercial QA passes  

Completion reports must list gate results (pass / fail / N/A with reason). Any fail → **NOT READY FOR RELEASE**.
