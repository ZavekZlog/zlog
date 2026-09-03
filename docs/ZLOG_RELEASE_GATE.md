# Zlog Release Gate (Mandatory)

**Version:** 1.2.0
**Date Updated:** 2026-09-03
**Reason Updated:** ESLint is an anti-regression gate (zero unapproved errors; fingerprint warning baseline; new warnings fail)
**User Decision:** ESLint baseline hardening — no product runtime refactor
**Previous Version:** 1.1.0

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

---

## Automated hard regression gate

In addition to the checklist above, run the **canonical** command:

```bash
npm run test:release
```

(`npm run test:release-gate` is an alias of the same runner.)

This executes:

1. **change-scope** — declared task scope vs dirty tree, high-risk blast radius, change budget  
2. **protected-scope** — always-protected shared paths  
3. **approved-copy** — approved UI terminology (source-string; **not** visual)  
4. **behaviour-registry** integrity  
5. **visual-baseline inventory** — approved PNGs present; forbidden baselines absent  
6. Auth + Site Diary + persistence + golden-journey **node** suites  
7. **ESLint gate** (`npm run check:eslint-gate`) — not `--max-warnings 0`:
   - unapproved ESLint **errors** must be zero (narrow registered exceptions only)
   - approved baseline **warning fingerprints** may remain
   - any **new** warning fingerprint fails, even if the total count did not increase
   - output states: `ESLint errors: N` / `Approved baseline warnings: N` / `New warnings: N` / `Known dormant defects (DORMANT-001): N`
   - registry: `docs/contracts/APPROVED_ESLINT_EXCEPTIONS.json`
   - baseline: `docs/contracts/APPROVED_ESLINT_WARNINGS.json`
   - dormant defects (not approved code): `docs/contracts/DORMANT_ESLINT_DEFECTS.json` — E8 in unmounted AreaPhotoViewer does not block today's release while DORMANT-001 is active; removing DORMANT-001 without resolving E8 fails the gate
8. Playwright behavioural E2E
9. Playwright **visual regression** for approved screens (HARD FAIL on mismatch; never auto-updates)

**Screenshot coverage today:** landing + login only. Dashboard / Sign out / Site Diary shells are refused until manual confirmation (`docs/VISUAL_REGRESSION.md`).

A green automated gate is **necessary but not sufficient**. Items marked `manualQA` in `docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json` remain mandatory Release Gate manual QA.

Operating procedure: `docs/ANTI_REGRESSION_ENFORCEMENT.md` · Manifest: `docs/PROTECTED_SCOPE_MANIFEST.json` · Visual: `docs/VISUAL_REGRESSION.md`.
