# Zlog Visual Regression (screenshot baselines)

**Version:** 1.0.0  
**Date Updated:** 2026-08-14  
**Status:** Enforceable for `status=approved` screens only  

Genuine Playwright screenshot comparisons. Complements — does not replace — change-scope, protected-scope, behavioural, and source-contract gates.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test:visual` | Compare against committed baselines (**never** updates) |
| `npm run test:visual:update` | Intentionally rewrite baselines (approval flags required) |
| `npm run check:visual-baselines` | Inventory / forbid baselines for non-approved screens |
| `npm run test:release` | Full gate including visual HARD FAIL on mismatch |

## Intentional baseline update (only)

```bash
ZLOG_ALLOW_VISUAL_BASELINE_UPDATE=1
ZLOG_VISUAL_BASELINE_REASON="user approved landing+login locked visuals"
npm run test:visual:update
```

Optional filter:

```bash
ZLOG_VISUAL_SCREENS=landing,login npm run test:visual:update
```

(`test:release` never passes `--update-snapshots`.)

## Viewports

| Name | Size | Use |
|------|------|-----|
| `mobile` | 390×844 @1x | Mobile-first |
| `desktop` | 1280×800 @1x | Dashboard/shell QA when approved |

## Baseline location

`e2e/visual/__baselines__/{mobile|desktop}/{screen-id}.png`

Registry: `e2e/visual/VISUAL_BASELINE_REGISTRY.json`

## Approved vs refused

| Screen | Status |
|--------|--------|
| Landing `/` | **approved** (LOCKED) |
| Login `/login` | **approved** |
| Dashboard | **known_regression** — Sign Out moved; **no baseline** |
| Sign Out crop | **known_regression** — **no baseline** |
| Site Diary entry / setup / workbench | **pending_manual_confirmation** — **no baseline** |

Do not create PNGs for non-approved screens. The inventory gate HARD FAILs if they appear.

## After manual QA restores Sign Out / confirms diary shells

1. User confirms the live UI is the approved locked state.  
2. Flip screen `status` to `approved` in the registry (explicit product decision).  
3. Run `test:visual:update` with approval flags.  
4. Commit the new PNGs only when the user asks to commit.
