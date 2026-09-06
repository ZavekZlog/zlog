# Site Diary PDF & Share Checkpoint Contract

**Version:** 1.1.0  
**Date Updated:** 2026-09-06  
**Reason Updated:** Site Diary audit — page-1 information architecture / completeness superseded; repeated header, footer, PHOTO-001, and Save/Share remain  
**User Decision:** APPROVED — Phase 0 contracts; PDF implementation is a later authorised phase  
**Previous Version:** 1.0.0  

**Known-good baseline (protected restore point):** `ab65437`  
**Commit message:** `checkpoint: lock verified PDF header and share recovery`  

This contract is **append-only**. It encodes behaviour manually verified on a real Android phone at the baseline above. Automated tests linked in `docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json` prove **source wiring only** — they do **not** replace phone acceptance.

**2026-09-06 supersession (page-1 IA only):** The approved **page-1 information architecture, masthead identity, and completeness of workbench data in the PDF** now live in `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md` §4L. That audit specification **supersedes** item 1 below as the approved page-1 *content/layout target*. Items 2–13 (repeated coloured header, content clearance, footer, Android generation, orientation isolation, Save/Share, data/photos) remain in force. Reporting-company `brand_color` / logo remain authoritative. PHOTO-001 no-crop/contain remains in force.

---

## Scope

| In scope | Out of scope (separate future task) |
|----------|-------------------------------------|
| Repeated coloured PDF header on every page | Cover/work-photo PDF orientation defect |
| Page-1 PDF appearance preservation | Runtime TRACE / debug instrumentation removal |
| Content below header; footer intact | Rewriting diary photo storage or in-app display |
| Share-first-tap PDF prepare/share recovery | Opportunistic refactors of protected components |

---

## Protected contracts

### PDF (1–6)

1. **Page-1 appearance** — Superseded as the approved page-1 *information architecture* by the 2026-09-06 audit (`SITE_DIARY_SCREEN_CONTRACT.md` §4L). Until that implementation phase, do not casually restyle page 1 outside an authorised PDF task. The ab65437 chrome (repeated header, footer) remains protected.
2. **Repeated header** — The coloured PDF header/banner must remain visibly present at the top of **every** physical PDF page.
3. **Content clearance** — PDF page content must begin below the repeated header and must not obscure it.
4. **Footer** — Existing footer behaviour must remain intact.
5. **Android generation** — PDF generation must continue to work on the real Android phone (manual acceptance; not replaceable by CI alone).
6. **Orientation isolation** — Future photo-orientation work must **not** modify or regress the repeated-header implementation (`PdfHeader`, `PageChrome`, `lib/diary-pdf-layout.js`).

### Save / Share (7–10)

7. **Saving behaviour** — Diary saving must retain the verified saving/saved behaviour.
8. **Save → Share flow** — A completed diary must continue into the Save / Share flow.
9. **Report Complete / PDF** — Report Complete / PDF generation must remain operational.
10. **Share isolation** — Future PDF-image work must not modify Save / Share behaviour unless explicitly scoped.

### Data / photos (11–13)

11. **No data rewrite** — Existing diary data, signature, cover-photo storage and work-photo storage must not be rewritten merely to fix PDF rendering.
12. **In-app display** — PDF-rendering fixes must not change how photographs appear inside the Zlog app.
13. **Orientation scope** — The unresolved orientation defect concerns **PDF rendering only** until runtime evidence proves otherwise.

---

## Future change governance

### Before editing (Site Diary, PDF generation, sharing)

1. Identify **`ab65437`** as the known-good baseline.
2. Inspect current diff/scope against that baseline.
3. State exact files intended to change.
4. State which protected contracts above could be affected.
5. Prohibit unrelated changes.
6. **Stop** if scope needs to expand.

### During editing

- Smallest surgical change only.
- No opportunistic refactoring.
- Do not rewrite protected components unnecessarily.
- Do not modify files outside declared scope without stopping first.

### After editing

Run focused regression verification for affected protected contracts.

**Photo-orientation work specifically verify (manual Android + automated source contracts):**

- page-1 PDF appearance unchanged;
- repeated coloured header on every PDF page;
- footer correct;
- PDF still generates;
- Save / Share still works;
- app photo display unchanged;
- only PDF image rendering changed.

Automated tests do **not** override the real Android phone acceptance test.

---

## Checkpoint rule

After any future change is manually tested on the real Android phone and **explicitly accepted**:

1. **STOP**
2. Focused regression verification
3. Isolate the accepted change from experimental work
4. Commit exact accepted state
5. Push
6. Confirm local/remote synchronization
7. Only then begin the next independent change

---

## Declared task scopes (machine-readable)

See `docs/PROTECTED_SCOPE_MANIFEST.json`:

| Scope id | Purpose |
|----------|---------|
| `pdf-repeated-header` | Repeated header / layout / PageChrome — **frozen** at checkpoint behaviour |
| `pdf-photo-orientation` | PDF image orientation rendering only — must not touch header stack or Save/Share |

---

## Executable tests

| Test file | Role |
|-----------|------|
| `lib/diary-checkpoint-ab65437-contract.test.js` | Checkpoint bundle: header + share + isolation rules |
| `lib/diary-pdf-layout.test.js` | PDF layout, header repetition, footer, content clearance |
| `lib/premium-ui-workbench-cta-contract.test.js` | Workbench Share CTA wiring |
| `lib/diary-saved-view.test.js` | Saved view Share Report + same-gesture fallthrough |

Registry ids: **PDF-034**, **PDF-035**, **DIARY-034** in `docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json`.

---

## Related documents

- `docs/ANTI_REGRESSION_ENFORCEMENT.md` — gate workflow
- `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md` — screen contract
- `docs/PROTECTED_SITE_DIARY_CONTRACT.md` — Site Diary behavioural summary
