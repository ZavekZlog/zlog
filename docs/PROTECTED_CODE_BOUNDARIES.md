# Protected Code Boundaries

**Version:** 1.0.0  
**Date Updated:** 2026-08-11  
**Reason Updated:** Hard anti-regression scope gate for Agents  
**User Decision:** Protected-path violations HARD FAIL; intentional override only  
**Previous Version:** none  

Machine-readable list: `docs/PROTECTED_CODE_BOUNDARIES.json`

## Purpose

A task scoped to one feature/module must **not** silently modify approved shared behaviour.

Protected areas include authentication/login, Sign out/session handling, dashboard shell / Sign out control, global navigation chrome, PremiumShell/shared layout, global responsive styles, shared report routing helpers under auth return-path, database migrations, and report/PDF branding pipeline entry points.

## Gate

```bash
npm run check:protected-scope
```

- Compares the **current dirty git tree** (staged + unstaged + untracked) against protected paths.
- **HARD FAIL** if any protected path is modified.
- Runs locally and as part of `npm run test:release-gate`.
- Excludes `*.test.js` / `*.spec.js`, `e2e/`, `scripts/`, and the boundary/registry docs themselves (tests may lock protected behaviour).

## Intentional override (deliberate and visible)

Only when the user has **explicitly authorised** touching protected files:

```bash
# Both required — never automatic
ZLOG_ALLOW_PROTECTED_SCOPE=1 ZLOG_PROTECTED_SCOPE_REASON="user approved auth fix" npm run check:protected-scope

# or
npm run check:protected-scope -- --allow-protected --reason "user approved auth fix"
```

The gate prints a loud override notice and exits 0 only when **both** the allow flag and a non-empty reason are present.

## Agent rule

Before modifying production code, state:

```text
INTENDED FILES TO CHANGE:
- file A — reason
- file B — reason

PROTECTED FILES TOUCHED:
- none
```

If implementation later requires a protected/shared file: **STOP.** Do not modify it automatically. Explain why and obtain explicit approval. Then use the override only for that authorised work.
