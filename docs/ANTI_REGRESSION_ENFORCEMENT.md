# Zlog Anti-Regression Enforcement

**Version:** 1.0.0  
**Date Updated:** 2026-08-14  
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
   Source-string terminology lock (Site Diary, Sign out, Save and Continue, …).
5. **Behaviour registry** — linked executable tests for diary/auth persistence rules.
6. **Visual regression** — `npm run test:visual` (compare) / `npm run test:visual:update` (intentional only).
7. **Canonical release** — `npm run test:release`  
   Aggregates all of the above + node suites + playwright behavioural + visual.

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
