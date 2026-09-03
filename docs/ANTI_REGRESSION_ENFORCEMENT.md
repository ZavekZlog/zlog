# Zlog Anti-Regression Enforcement

**Version:** 1.1.0
**Date Updated:** 2026-09-03
**Reason Updated:** ESLint fingerprint gate (approved warnings vs new warnings)
**User Decision:** ESLint baseline hardening — no product runtime refactor
**Previous Version:** 1.0.0
**Status:** Enforceable (gates HARD FAIL) — not advisory-only

This document is the operating procedure for the machine-checked guardrails in `docs/PROTECTED_SCOPE_MANIFEST.json`.

## Why previous guardrails failed

| Protection | Type | Why it did not stop Sign out / layout regressions |
|------------|------|---------------------------------------------------|
| Cursor rules / Constitution / DESIGN.md | Advisory | Agents can ignore prompts |
| `PROTECTED_CODE_BOUNDARIES` + override | Binary path gate | One override allowed **any** protected file in the dirty tree |
| No declared task scope | Missing | “Fix Report Date” could still touch dashboard chrome |
| `*.contract.test.js` | Source-pattern | Asserts strings/classes exist — **not** on-screen geometry |
| Behaviour registry | Index + file existence | Does not stop unrelated file edits |
| `test:release-gate` | Partial | Agents ran only the small tests they added |
| Playwright golden auth | Behavioural E2E | Not screenshot visual; often skipped if browsers missing |

**Honest gap (still open for some screens):** Dashboard / Sign Out / Site Diary shells are **not** screenshot-baselined until manual confirmation — see `docs/VISUAL_REGRESSION.md` and `e2e/visual/VISUAL_BASELINE_REGISTRY.json`. Landing + login **are** protected by genuine Playwright screenshots.

## Architecture (consolidated — do not duplicate)

1. **Manifest** — `docs/PROTECTED_SCOPE_MANIFEST.json`  
   Features → files, high-risk blast radius, named task scopes, change budgets.
2. **Change-scope gate** — `npm run check:change-scope`  
   Declared scope must cover every dirty product file; high-risk requires approving scopes; budgets apply.
3. **Protected-scope gate** — `npm run check:protected-scope`  
   Always-protected paths (expanded; sourced from the manifest).
4. **Approved copy** — `npm run check:approved-copy`  
   Source-string terminology lock (Site Diary, Sign out, Project & Report Details, …).
5. **Behaviour registry** — linked executable tests for diary/auth persistence rules.
6. **Visual regression** — `npm run test:visual` (compare) / `npm run test:visual:update` (intentional only).
7. **ESLint gate** — `npm run check:eslint-gate`
   Zero unapproved live errors. Approved warning fingerprints may remain. Any new warning fails. Do not treat baseline warnings as a clean codebase.
   Known defects in dormant/unmounted files (`docs/contracts/DORMANT_ESLINT_DEFECTS.json`) are **not** approved exceptions. They are reported and non-blocking only while DORMANT-001 is active. Removing DORMANT-001 without resolving E8 fails the gate. Do not add ESLINT-E8.
8. **Canonical release** — `npm run test:release`
   Aggregates all of the above + node suites + playwright behavioural + visual.

## Checkpoint ab65437 (protected restore point)

Phone-verified baseline: commit **`ab65437`** — repeated coloured PDF header on every page + Share-first-tap PDF recovery.

- Contract: `docs/contracts/SITE_DIARY_PDF_CHECKPOINT_CONTRACT.md`
- Executable tests: `lib/diary-checkpoint-ab65437-contract.test.js`, `lib/diary-pdf-layout.test.js`
- Task scopes: `pdf-repeated-header`, `pdf-photo-orientation` in `docs/PROTECTED_SCOPE_MANIFEST.json`
- Registry: **PDF-034**, **PDF-035**, **DIARY-034**

Future PDF orientation work must declare `pdf-photo-orientation` and must **not** modify the repeated-header stack without explicit approval. Automated tests do not replace real Android phone acceptance.

## Agent checklist (mandatory)

1. Read `docs/PROTECTED_SCOPE_MANIFEST.json` and this file before editing.
2. Declare intended scope (`ZLOG_TASK_SCOPE` or `.zlog-task-scope.json`).
3. Do not modify protected/high-risk files outside that scope.
4. Inspect `git status` / `git diff` before claiming complete.
5. Run **`npm run test:release`** (not only your new unit tests).
6. Report unexpected dirty files; do not “fix” unrelated regressions by redesigning shared chrome.
7. Never commit/push unless the user explicitly asks.
8. If a shared component must change: **STOP** and request approval.

## Declaring scope examples

```bash
# Narrow Report Date fix
ZLOG_TASK_SCOPE=site-diary-report-date
ZLOG_TASK_SCOPE_REASON="Report Date = browser-local today for new diaries"

# Shared CTA / Sign out / Back (HIGH RISK — user approval required)
ZLOG_TASK_SCOPE=global-shell
ZLOG_TASK_SCOPE_REASON="user approved secondary CTA plate fix"
ZLOG_ALLOW_PROTECTED_SCOPE=1
ZLOG_PROTECTED_SCOPE_REASON="user approved secondary CTA plate fix"
```

## What still cannot be auto-protected

- Pixel movement on **non-approved** screens (dashboard Sign out, diary shells) until you confirm and flip registry status
- Live Supabase session journeys marked `manualQA` in the behaviour registry
- Device keyboard / landscape feel
- Commercial “would we demo this?” judgement

## Visual baselines

See `docs/VISUAL_REGRESSION.md`. Agents must never “fix” a visual failure by regenerating baselines without user approval flags.
