# Protected Code Boundaries

**Version:** 2.0.0  
**Date Updated:** 2026-08-14  
**Reason Updated:** Consolidate into enforceable protected-scope manifest + change-scope gate  
**User Decision:** Hard anti-regression enforcement pass  
**Previous Version:** 1.0.0  

## Canonical sources

| Role | Path |
|------|------|
| **Protected-scope manifest (machine-readable)** | `docs/PROTECTED_SCOPE_MANIFEST.json` |
| Legacy path list (compat) | `docs/PROTECTED_CODE_BOUNDARIES.json` |
| Approved UI terminology | `docs/contracts/APPROVED_UI_COPY.json` |
| Approved behaviours | `docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json` |
| Operating procedure | `docs/ANTI_REGRESSION_ENFORCEMENT.md` |

## Canonical release command

```bash
npm run test:release
```

(`npm run test:release-gate` remains as a legacy alias that also points at the same runner.)

## Gates (HARD FAIL)

```bash
npm run check:change-scope      # declared task scope vs dirty tree + budget + high-risk
npm run check:protected-scope   # always-protected paths
npm run check:approved-copy     # approved UI labels still present (source-string, NOT visual)
```

### Declaring scope (required when product files are dirty)

```bash
# Option A — env
ZLOG_TASK_SCOPE=site-diary-report-date
ZLOG_TASK_SCOPE_REASON="Fix Report Date to browser-local today"

# Option B — file (gitignored)
# .zlog-task-scope.json
# { "scope": "site-diary-report-date", "reason": "…", "extraFiles": [] }
```

High-risk scopes (`global-shell`, `dashboard-shell`, `landing-auth`, `schema-migration`) also require:

```bash
ZLOG_ALLOW_PROTECTED_SCOPE=1
ZLOG_PROTECTED_SCOPE_REASON="user approved …"
```

## Why Sign out could move during Site Diary work (fixed gap)

1. Diary Back styling shares `.zlog-secondary-cta` in **protected** `app/globals.css`.
2. A blanket protected-scope **override** allowed any protected file in the dirty tree.
3. There was **no declared task scope allowlist**, so unrelated dashboard/header files were not blocked relative to the stated task.
4. Source contracts check CSS strings — they do **not** detect pixel/layout movement.

The change-scope gate closes (1)–(3). Pixel/layout detection remains a **future screenshot baseline** task.

## Agent rule

Before modifying production code:

```text
INTENDED SCOPE: <scope-id from PROTECTED_SCOPE_MANIFEST.json>
INTENDED FILES TO CHANGE:
- file A — reason
PROTECTED / HIGH-RISK TOUCHED:
- none | list with explicit user approval
```

If a shared/high-risk file is required: **STOP** and ask. Do not redesign around an unrelated regression.
