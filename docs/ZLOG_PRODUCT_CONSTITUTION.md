# ZLOG_PRODUCT_CONSTITUTION v1.3

**Document:** Zlog Product Constitution  
**Version:** 1.3  
**Status:** **FROZEN**  
**Date Frozen:** 2026-08-07  
**User Decision:** Freeze the Constitution at v1.3; do not casually add Principle 8+  
**Previous Version:** 1.3.2 (pre-freeze draft numbering; content of Principles 1–7 unchanged)

Contracts are **append-only** unless explicitly approved. This document is foundational governance.

---

## Constitution freeze

This Constitution is **frozen at v1.3**.

Do **not** casually add Principle 8, 9, 10, …

If a new idea does **not** justify changing how the **entire product is governed**, it belongs in:

- a **feature contract** (`docs/contracts/…`),  
- the **product backlog** (`docs/ZLOG_PRODUCT_BACKLOG.md`), or  
- a **design note** / screen contract,

— **not** in this Constitution.

Amending this Constitution (including adding a new Fundamental Principle) requires an **explicit user decision** to unfreeze or supersede **ZLOG_PRODUCT_CONSTITUTION v1.3**, with Version / Date / Reason / User Decision / Previous Version recorded.

---

## Fundamental Principles (v1.3 — frozen)

1. **Zlog is a commercial software product.**
2. **The objective is to produce the highest quality construction reporting platform, not merely working code.**
3. **Every change must preserve previously approved functionality unless explicit approval is obtained.**
4. **All visible UI must appear intentionally designed on supported devices** — including text that fits, no overlapping controls, consistent spacing, no cropped icons/images, no controls outside containers, and no unfinished layout shifts.  
   Detail: `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`
5. **Working software is not the definition of done. Professional software is.**  
   Detail: `docs/ZLOG_RELEASE_GATE.md`
6. **The burden of proof lies with change, not stability.** Existing approved behaviour is presumed correct until a documented product decision explicitly supersedes it.
7. **Preserve user trust.** Every change must preserve or improve the user's confidence in the product. Changes that introduce inconsistency, unnecessary friction, regressions, or unexpected behaviour violate this principle, even if the code functions correctly.

---

## Rules

### 1. Classify before implementing

Before implementing any feature, Cursor must classify it as one of:

- Bug Fix  
- New Feature  
- Enhancement  
- Refactor  
- Architectural Change  
- UI Polish  

### 2. Impact Assessment for existing workflows

If the change affects any existing workflow, Cursor must produce an **Impact Assessment** that identifies:

- screens affected  
- components affected  
- database tables  
- migrations  
- APIs  
- tests requiring update  
- possible regressions  

**before** modifying code.

### 3. Approved behaviour changes require approval

If any approved behaviour changes, Cursor must **stop** and ask for approval.

**Never silently change behaviour.**

**Burden of proof:** Change must justify itself. Existing approved behaviour is **presumed correct** until a documented product decision explicitly supersedes it. “Probably better,” cleanup, or consistency alone is not enough.

### 4. Contract conflicts

If a proposed implementation conflicts with an approved contract:

**STOP.**

Report:

- contract  
- section  
- conflict  
- proposed solution  

Wait for approval.

### 5. Regression risk disclosure

If Cursor cannot guarantee preservation of existing behaviour it must explicitly state:

> Regression risk exists.

**before** changing anything.

### 6. Intentional UI design (global)

All visible UI must look **intentionally designed** on supported devices.

**Never acceptable:** clipped/truncated text without intent; overlapping controls; inconsistent spacing; cropped icons or images; controls outside containers; layout shifts that make the UI look unfinished.

If text does not fit: rewrite shorter (**preferred**), wrap, enlarge the control, or redesign layout/component. **Do not** simply clip or truncate.

A screen is **not complete** until **every** visible control, label, placeholder, button, dialog, toast, dropdown, validation message, and navigation element has been **visually verified** on the supported mobile viewport(s).

Full contract: `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`

### 7. Completion statement (before asking for commit)

When a feature is complete, Cursor must state:

- New behaviour added  
- Existing behaviour preserved  
- Known limitations  
- Regression tests performed  
- **Release Gate results** (Visual · Mobile · Functional · Regression · UX · Commercial)  

**before** asking for commit.

Never mark complete because the code compiles.

### 8. Definition of done / Release Gate

**Working software is not the definition of done. Professional software is.**

No screen, feature, or workflow is complete until **all** of `docs/ZLOG_RELEASE_GATE.md` pass:

1. Visual QA  
2. Mobile QA  
3. Functional QA  
4. Regression QA  
5. UX QA  
6. Commercial QA  

Plus:

- implementation finished  
- tests pass  
- contracts updated if approved  
- backlog updated  

If any gate item fails → **NOT READY FOR RELEASE**.

---

## Related

- `docs/ZLOG_RELEASE_GATE.md`  
- `.cursor/rules/commercial-product-governance.mdc`  
- `.cursor/rules/zlog-ux-clarity.mdc`  
- `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`  
- `docs/contracts/README.md`  
- `docs/ZLOG_PRODUCT_BACKLOG.md`  
- `docs/PROTECTED_PRODUCT_DECISIONS.md`  
