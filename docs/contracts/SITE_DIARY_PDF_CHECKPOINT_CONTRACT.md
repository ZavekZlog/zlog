# Site Diary PDF & Share Checkpoint Contract

**Version:** 1.9.0
**Date Updated:** 2026-10-01
**Reason Updated:** Record S10 Saved Viewer single-load acceptance. Prior checkpoints are unchanged.
**User Decision:** Documentation checkpoint only — Saved Viewer single-load accepted on Galaxy S10
**Previous Version:** 1.8.0

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

## S10 Auto Prepare acceptance

**Date:** 30 September 2026
**Baseline commit:** `d795dad866a9a0df5b00b828a5e67eb32f27469c`
**Commit subject:** Persist and reuse Site Diary ready PDF artifacts

This entry does not replace the `ab65437` PDF header and Share checkpoint above.

Canonical release gate for this baseline: 202 suites, 1102 tests, 1102 pass, 0 fail. ESLint PASS. Playwright behavioural PASS. Playwright visual PASS. `test:release` automated portion PASS.

Samsung Galaxy S10 PWA is authoritative.

| Observation | Result |
|-------------|--------|
| First uncached Report Ready, from tapping Edit | ~24 sec. Not considered optimised. Remaining target is the initial ready-PDF artifact transfer. |
| Repeat unchanged diary Report Ready, after tapping Edit | ~7 sec. Observed S10 measurement, not a guaranteed timing target. |

**Repeat-open Auto Prepare: ACCEPTED ON S10**

The repeat path shown was: fresh authoritative identity → exact persistent worker artifact reuse → resident File → Report Ready.

During that repeat test, saved Workbench photos took up to ~10 seconds to become visible. That is separate photo-hydration follow-on work. It does not invalidate or reopen this Auto Prepare acceptance.

---

## S10 Workbench photo priority acceptance

**Date:** 30 September 2026
**Tested commit:** `be18d10e9d50744bfaa6094b377fa33d451d8936`
**Commit subject:** Prioritize saved Workbench thumbnail loading
**Accepted Auto Prepare baseline:** `d795dad866a9a0df5b00b828a5e67eb32f27469c`
**Existing Auto Prepare acceptance checkpoint:** `be778c579902c7d6fcd9ed843a776f31ed0c7fe7`

This entry does not replace the `ab65437` PDF header and Share checkpoint, and it does not replace the S10 Auto Prepare acceptance above.

Canonical release gate for this commit: 212 suites, 1153 tests, 1153 pass, 0 fail. ESLint PASS. Playwright behavioural PASS. Playwright visual PASS.

Samsung Galaxy S10 PWA is authoritative.

### Observation 1 — Saved diary open

Thailand saved diary: approximately 5 seconds from tap until the diary opened. A discernible screen blink occurred before the diary opened. The open was repeated twice, and the blink was observed both times.

This is a separate navigation/display observation. Its cause is not classified in this checkpoint.

### Observation 2 — Edit transition

After tapping Edit, the screen went black for approximately 4 seconds before the Edit Workbench appeared.

This is a separate Edit-transition UX/performance issue requiring later diagnosis. It is not attributed to photo loading or Auto Prepare.

### Observation 3 — Saved Workbench photos

Before this optimisation, saved Workbench photos could take up to approximately 10 seconds to become visible.

On this `be18d10` acceptance run, by the time the user scrolled down through the Edit Workbench, all saved pictures were already loaded. No comparable ~10-second blank-photo wait was observed.

This is qualitative acceptance evidence that thumbnail-priority behaviour improved the visible Workbench experience. First-thumbnail timing was not measured and is not recorded as a number.

**WORKBENCH PHOTO PRIORITY — S10 QUALITATIVE IMPROVEMENT OBSERVED**

A future measured trace may quantify first/all thumbnail timing if needed.

### Observation 4 — Report Ready

After tapping Edit, Report Ready appeared in approximately 8 seconds.

The previously locked repeat-open Auto Prepare observation remains approximately 7 seconds. Approximately 8 seconds is an observed run, not a guaranteed timing.

**NO MATERIAL REPEAT-OPEN AUTO PREPARE REGRESSION OBSERVED**

The previously accepted persistent ready-PDF reuse remains accepted. The `d795dad` Auto Prepare architecture is not reopened on the 7 sec versus 8 sec variation.

### Separation

These remain distinct concerns:

1. Workbench photo priority: qualitative improvement observed.
2. Auto Prepare repeat Report Ready: ~8 sec; accepted architecture remains intact.
3. Saved diary opening: ~5 sec plus a repeatable screen blink.
4. Edit transition: ~4 sec black screen before the Workbench appears.

The next technical investigation should concern the saved-diary/Edit navigation rendering behaviour, not Auto Prepare or persistent PDF caching.

---

## S10 Unit 1A Edit handoff acceptance

**Date:** 1 October 2026
**Accepted commit:** `92a285ce31f31e9b47efc9bcb6d93fe717758d76`
**Commit subject:** Add verified Viewer to Edit core row handoff
**Live migration:** `20261001120000_finalize_site_diary_save_expected_report` on the S10 Preview backend
**Authoritative device:** Samsung Galaxy S10 PWA
**Edit session:** `1790820078424-lutkznk`
**Diary:** the same saved Thailand diary used for this acceptance run

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, or the S10 Workbench photo priority acceptance above.

Canonical release gate for this commit: 218 suites, 1184 tests, 1184 pass, 0 fail. ESLint 0 errors. Playwright behavioural 6 pass. Playwright visual 4 pass, 10 skipped.

### Edit handoff

Unit 1A reused the Viewer raw project row and the Viewer raw `daily_reports` row. The duplicate project fetch was skipped. The duplicate `daily_reports` fetch was skipped.

| Step | Diagnostic |
|------|------------|
| Tap → route commit | 37 ms |
| Route commit → Workbench import start | 8 ms |
| Workbench import | 523 ms |
| Import resolved → Workbench mount | 29 ms |
| Workbench mount → usable | 1270 ms |
| Tap → usable Workbench | 1867 ms |

The phone observation for tap → usable Workbench was approximately 3 seconds.

**UNIT 1A — ACCEPTED ON GALAXY S10**

### Child lifecycle

The existing blocking child path still ran before usable:

| Step | Diagnostic |
|------|------------|
| Pending cover | 11 ms |
| Labour | 426 ms |
| Plant | 416 ms |
| Photo metadata | 539 ms |
| Signature | 11 ms |

### Final Save guard

The atomic final-Save stale guard is live. A warm Save sends the acknowledged report baseline. A mismatch returns stale before any report, labour, plant, or photo write. A cold Save that omits the expected baseline keeps the previous write behaviour.

### Report Ready

The accepted persistent PDF reuse remained intact. After the Workbench became usable, export enqueue returned ready. `background-pdf-prepare-start` reached `background-pdf-ready` in approximately 30 ms, with handoff `file-ready`, for the existing artifact of approximately 5.7 MB. There was no PDF invalidation and no fresh PDF build.

The phone observed Report Ready approximately 2 seconds after the Workbench became usable because of fingerprint/readiness work before that existing ready artifact was surfaced.

The Auto Prepare architecture is not reopened.

### Separate future units

These are not part of Unit 1A:

1. The Thailand saved Viewer still has the known open blink. Viewer open was approximately 5.5 seconds in this test.
2. Workbench module/import latency can vary and previously reached several seconds. That remains a later unit.
3. Locked UX backlog, not implemented here: opening an unchanged saved diary in Edit must not visually imply that a new report is being prepared. An existing valid PDF should remain silently available. A genuinely changed diary should invalidate the old PDF only when appropriate, and a replacement should be prepared after successful Save.

---

## S10 Unit 2 shared Workbench preload acceptance

**Date:** 1 October 2026
**Accepted commit:** `aea941ea08d2457b58d1b998893020877a62eb6d`
**Commit subject:** Share Workbench module preload across Viewer and Edit
**Authoritative device:** Samsung Galaxy S10 PWA
**Diary:** the same saved Thailand diary used for the Unit 1A acceptance run

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, the S10 Workbench photo priority acceptance, or the S10 Unit 1A Edit handoff acceptance above.

Canonical release gate for this commit: 220 suites, 1189 tests, 1189 pass, 0 fail. ESLint 0 errors. Playwright behavioural 6 pass. Playwright visual 4 pass, 10 skipped.

### Shared Workbench module promise

Unit 2 coordinates the saved Viewer background preload and the Site Diary shell `next/dynamic` loader through one memoised Workbench module import promise. A rejected import clears that cached promise so a later Edit can retry. A resolved promise stays cached for the lifetime of the current document.

### S10 Edit sessions

| Session | Workbench import | Tap → usable | Warm core-row handoff |
|---------|-----------------:|-------------:|------------------------|
| `1790823948968-v5ayxn2` | 3 ms | 1270 ms | USED |
| `1790823981342-kwo4236` | 1 ms | 1575 ms | USED |
| `1790824092802-n8r2civ` | 2 ms | 2395 ms | USED |
| `1790824162666-vb6b2bn` | 3 ms | 1114 ms | USED |

Controlled warm-Viewer samples:

| Viewer dwell before Edit | Workbench import |
|--------------------------|-----------------:|
| 29.7 sec | 3 ms |
| 18.7 sec | 3 ms |

The acceptance target was a Workbench import of 600 ms or less on two controlled warm-Viewer runs. Both samples passed. The previously measured slow import band of approximately 4900 ms and 7227 ms did not recur. Tap → usable across the four Edits was 1114–2395 ms.

**UNIT 2 — ACCEPTED ON GALAXY S10**

### Unit 1A protection

Unit 1A remained intact on all four runs. The duplicate project fetch was skipped. The duplicate `daily_reports` fetch was skipped. Each in-memory handoff was approximately 4–6 ms. Unit 1A is not reopened.

### Report Ready

The existing PDF reuse architecture remained intact. On all four Edits, export enqueue returned ready and reconcile completed ready. No fresh background PDF prepare or build occurred. Auto Prepare is not reopened.

### Separate future units

These are not part of Unit 2:

1. Saved Viewer open/blink remains separate.
2. Post-usable photo completion remains separate. On two runs the Workbench was usable at about 1.6–2.4 seconds, while all visible work photos did not finish displaying until roughly 14–15 seconds later. Signed photo URLs were already ready within roughly 30 ms of usable, so this is not a Unit 2 module-load failure.
3. Locked UX backlog, not implemented here: opening an unchanged saved diary in Edit must not visually imply that a new report is being prepared when the existing PDF artifact is merely being reused.

---

## S10 photo-tail H7 prewarm acceptance

**Date:** 1 October 2026
**Accepted commit:** `b3245690527ba6aaa018a9ee3f3938534d0075b6`
**Commit subject:** Delay PDF asset prewarm until saved thumbnails load
**Authoritative device:** Samsung Galaxy S10 PWA
**Diary:** the same saved Thailand diary used for the Unit 1A and Unit 2 acceptance runs

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, the S10 Workbench photo priority acceptance, the S10 Unit 1A Edit handoff acceptance, or the S10 Unit 2 shared Workbench preload acceptance above.

Canonical release gate for this commit: 221 suites, 1195 tests, 1195 pass, 0 fail. ESLint 0 errors, 65 approved warnings, 0 new. Playwright behavioural 6 passed. Playwright visual 4 passed, 10 skipped.

### H7 prewarm release

H6 remains the first expected saved-work thumbnail becoming visible. H7 remains every expected saved-work thumbnail becoming visible. Full-size PDF asset prewarm now releases on H7. The existing 15-second fallback remains available when H7 does not occur. Prewarm concurrency is unchanged. On both acceptance runs the fallback did not fire, and no full-size `report.jpg` prewarm began before H7.

### S10 Edit sessions

Both runs entered Edit before Viewer H7. Each Viewer session was cancelled with no Viewer H7.

| Edit session | Viewer session | Viewer dwell | Tap → usable | Workbench import | H6 after usable | H6 → H7 | Prewarm trigger | Unit 1A |
|--------------|----------------|-------------:|-------------:|-----------------:|----------------:|--------:|-----------------|---------|
| `1790828123786-3010ul0` | `1790828119428-iy4lt6h` | 4.36 sec | 1209 ms | 3 ms, `chunk=no-new-script` | 144 ms | 5424 ms | H7 | USED |
| `1790828231388-ap238qt` | `1790828226382-7bgjmfm` | 5.01 sec | 1492 ms | 2 ms, `chunk=no-new-script` | 154 ms | 3416 ms | H7 | USED |

### Before / after

Previous interrupted or cold Edit photo tails on the same diary:

| Session | H6 → H7 |
|---------|--------:|
| `1790823981342-kwo4236` | ~14.4 sec |
| `1790824092802-n8r2civ` | ~14.2 sec |

After this repair the two interrupted-Viewer runs completed H6 → H7 in 5424 ms and 3416 ms. The prior ~14–15 second post-usable photo stall did not reproduce. The residual completion times, 5.42 sec and 3.42 sec, are recorded as accepted. They are not a further optimisation in this checkpoint.

**PHOTO TAIL H7 FIX — ACCEPTED ON GALAXY S10**

### Unit 1A protection

Unit 1A remained intact. Warm project/report handoff spans were 5 ms / 4 ms on the first run and 7 ms / 4 ms on the second. Unit 1A is not reopened.

### Unit 2 protection

Unit 2 remained intact. Workbench imports were 3 ms and 2 ms, both `chunk=no-new-script`. Unit 2 is not reopened.

### Report Ready

The existing PDF artifact reuse remained intact. Both runs followed `enqueue=ready` → `r9-complete` → `post-hydrate-pdf-reconcile-ready`. There was no `r6`, `r7`, or `r8` signed blob fetch, no `background-pdf-prepare-start`, and no fresh PDF build. Auto Prepare and the PDF artifact architecture are not reopened. Photo-tail H7 scheduling is not reopened.

### Separate future issues

These are not part of this acceptance:

1. Saved Diary list → Viewer dark/blink/full-document transition remains separate.
2. Locked UX backlog, not implemented here: opening an unchanged saved diary in Edit must not visually imply that a new report is being prepared when an existing valid PDF is merely being reused.

---

## S10 Saved Viewer blink acceptance

**Date:** 1 October 2026
**Accepted commit:** `c119251b1d555e7d9d49ae3a9948acb00d874bcd`
**Commit subject:** Keep one loading shell while opening saved diary
**Authoritative device:** Samsung Galaxy S10 PWA
**Diary:** the same saved Thailand diary used for the Unit 1A, Unit 2, and photo-tail H7 acceptance runs

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, the S10 Workbench photo priority acceptance, the S10 Unit 1A Edit handoff acceptance, the S10 Unit 2 shared Workbench preload acceptance, or the S10 photo-tail H7 prewarm acceptance above.

Canonical release gate for this commit: 221 suites, 1196 tests, 1196 pass, 0 fail. ESLint 0 errors, 65 approved warnings, 0 new. Playwright behavioural 6 passed. Playwright visual 4 passed, 10 skipped.

### Accepted open path

Saved diary open uses `router.push` of the unchanged `savedDiaryViewerHref`. The Viewer remains `ssr: false`. One stable Viewer opening shell stays mounted from the first destination commit until the saved diary finishes loading. The dynamic placeholder, the Viewer loading return, and the Suspense fallback do not mount another full-screen shell. Saved Viewer Back returns to `/dashboard/diary?view=saved`.

### S10 opens

Surrounding navigation on the same device: Login → 5 cards was effectively instant. 5 cards → Site Diary panel was about 2 seconds. Saved Diaries list was about 2.5 seconds.

| Run | Open time | Blink |
|-----|----------:|-------|
| 1 | ~6 sec | none |
| 2 | ~4 sec | none |

Two consecutive S10 visual passes. The previously visible Saved Diaries → Viewer dark/blink transition did not reproduce on either open. The current visual sequence is accepted.

**SAVED VIEWER BLINK FIX — ACCEPTED ON GALAXY S10**

### Separate future issue

The remaining approximately 4–6 second Viewer loading duration is a separate performance characteristic. It is not part of this accepted visual-blink unit and is not optimised in this checkpoint. Viewer duration may be a future optimisation only if it is later prioritised.

### Protected work

Unit 1A, Unit 2, the H7 photo-tail fix, and Report Ready / PDF reuse are unchanged and are not reopened. The locked unchanged-report PDF UX backlog remains separate.

---

## S10 final-Save report-state acceptance

**Date:** 1 October 2026
**Accepted commit:** `e63ae2f4f8155a44d08d972d1f4290636385b979`
**Commit subject:** Use one owner for post-Save PDF completion
**Authoritative device:** Samsung Galaxy S10 PWA
**Edit session:** `1790853228272-11zef1y`
**Diary:** report `6846b690-b3f8-4a28-b0c1-a9a825a850f0`, the same saved Thailand diary used for the Unit 1A, Unit 2, photo-tail H7, and Saved Viewer blink acceptance runs

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, the S10 Workbench photo priority acceptance, the S10 Unit 1A Edit handoff acceptance, the S10 Unit 2 shared Workbench preload acceptance, the S10 photo-tail H7 prewarm acceptance, or the S10 Saved Viewer blink acceptance above.

Canonical release gate for this commit: 226 suites, 1216 tests, 1216 pass, 0 fail. ESLint 0 errors, 65 approved warnings, 0 new. Playwright behavioural 6 passed. Playwright visual 4 passed, 10 skipped.

### Locked report state

Unchanged Edit keeps Save as Save. It does not show Report Ready and it does not prepare a replacement PDF.

Autosave marks the previous PDF stale. It does not prepare a replacement PDF and it does not show Report Ready.

Final Save is the sole completion signal. The button shows Saving… until durable enqueue, then returns to Save. One later transition shows Report Ready — Share Now.

The accepted sequence does not show Preparing report…, does not oscillate Report Ready → Save → Report Ready, and does not run a second completion owner, a second Workbench download, or a second worker build for that export.

### S10 final Save

| Point | UTC time | From tap |
|-----|----------|----------|
| Save tap | 11:15:20.450Z | 0 |
| Diary persisted | 11:15:23.225Z | 2801 ms |
| Authoritative fingerprint `ff9ea41f` | 11:15:29.042Z | 8618 ms |
| Durable enqueue | 11:15:29.355Z | 8931 ms |
| Save release | 11:15:29.386Z | 8.936 sec |
| Report Ready | 11:15:29.400Z | one transition |

Export `5fdc2530-1d62-40b1-8da8-762b68639e1f`, fingerprint `ff9ea41f`. One `setShareReady(true)`. No `background-pdf-prepare-start`. No post-Save `pdf-invalidate`. No duplicate Workbench download.

**FINAL SAVE REPORT STATE — ACCEPTED ON GALAXY S10**

### Protected work

Unit 1A, Unit 2, the H7 photo-tail fix, the Saved Viewer blink fix, the worker/cache architecture, and autosave remain intact and are not reopened.

### Separate future issue

Saved Viewer open duration remains a separate performance item. It is not part of this accepted report-state unit and is not fixed in this checkpoint.

On this same S10 run the Thailand Viewer opened in two attempts. Attempt 1 was H0→H1 6664 ms, then cancelled and restarted. Attempt 2 was H0→H1 692 ms and H12 3740 ms. Wall time from the first H0 to the second H12 was about 10.4 seconds. Viewer blink remained absent. This double-load may be a future performance item only if it is later prioritised.

---

## S10 Saved Viewer single-load acceptance

**Date:** 1 October 2026
**Accepted commit:** `ffc4275a43cc59b3919c5e9d054713a69557bbf7`
**Commit subject:** Prevent duplicate Saved Viewer load
**Authoritative device:** Samsung Galaxy S10 PWA
**Diary:** report `6846b690-b3f8-4a28-b0c1-a9a825a850f0`, the same saved Thailand diary used for the Unit 1A, Unit 2, photo-tail H7, Saved Viewer blink, and final-Save report-state acceptance runs

This entry does not replace the `ab65437` PDF header and Share checkpoint, the S10 Auto Prepare acceptance, the S10 Workbench photo priority acceptance, the S10 Unit 1A Edit handoff acceptance, the S10 Unit 2 shared Workbench preload acceptance, the S10 photo-tail H7 prewarm acceptance, the S10 Saved Viewer blink acceptance, or the S10 final-Save report-state acceptance above.

Canonical release gate for this commit: 226 suites, 1216 tests, 1216 pass, 0 fail. ESLint 0 errors, 65 approved warnings, 0 new. Playwright behavioural 6 passed. Playwright visual 4 passed, 10 skipped.

### Previous defect

The Saved Viewer load effect depended on `publishVerifiedViewerSnapshot`. After the first successful load, publishing the loaded project and report ids changed that publisher’s identity. Effect cleanup cancelled the first load, then the same URL project and report started a second load. The prior S10 open was about 10.4 seconds because of that discarded first load.

### Accepted single load

The Viewer load effect now depends only on the URL project id and report id. The current publisher is kept in a ref. Publication still occurs. A different diary and unmount still cancel. One Viewer hydration/load per saved-diary open is proven.

| Run | Session | H0 → H1 | H0 → H12 | H6 | H7 | Same-diary restart |
|-----|---------|--------:|---------:|---:|---:|--------------------|
| 1 | `1790865618770-j9kim6t` | 1600 ms | 5733 ms | 4731 ms | 6235 ms | none |
| 2 | `1790865714433-g5blgbu` | 3366 ms | 5474 ms | 5540 ms | 5565 ms | none |

Run 1 ended `cancelled` only when the user later navigated Back. Run 2 had no immediate cancelled first attempt and no second load. Phone time was about 5 seconds on Run 1 and about 6 seconds on Run 2, with all photos loaded on Run 2. Viewer blink was none.

**SAVED VIEWER DOUBLE-LOAD FIX — ACCEPTED ON GALAXY S10**

### Protected work

Unit 1A, Unit 2, the H7 photo-tail fix, the Saved Viewer blink fix, final-Save report state, PDF worker/cache, Viewer Share recovery, autosave, Save, auth, navigation URLs, and Back remain intact and are not reopened.

---

## Related documents

- `docs/ANTI_REGRESSION_ENFORCEMENT.md` — gate workflow
- `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md` — screen contract
- `docs/PROTECTED_SITE_DIARY_CONTRACT.md` — Site Diary behavioural summary
