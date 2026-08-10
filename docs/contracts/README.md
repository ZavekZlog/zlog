# Contract hierarchy (commercial product)

**Version:** 1.5.1  
**Date Updated:** 2026-08-07  
**Reason Updated:** Constitution frozen at ZLOG_PRODUCT_CONSTITUTION v1.3  
**User Decision:** Freeze Constitution; no casual Principle 8+  
**Previous Version:** 1.5.0  

Zlog is a **commercial product**, not a prototype. Approved screens, flows, controls, wording, ordering, persistence and interactions are production contracts.

## Layers (authoritative)

| Layer | Document | Scope |
|-------|----------|--------|
| **0. Constitution** | **`docs/ZLOG_PRODUCT_CONSTITUTION.md`** — **ZLOG_PRODUCT_CONSTITUTION v1.3 (FROZEN)** |
| **0b. Global UI** | **`docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md`** | Intentional design + text fit + mobile visual QA |
| **0c. Release Gate** | **`docs/ZLOG_RELEASE_GATE.md`** | Mandatory Visual/Mobile/Functional/Regression/UX/Commercial QA |
| **A. Product** | `docs/PROTECTED_PRODUCT_DECISIONS.md` | Global decisions across Zlog |
| **B. Screen** | `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md` | Site Diary structure, order, controls, states, transitions |
| **C. Feature** | `docs/contracts/PROJECT_MODEL_CONTRACT.md` | Project sticky / programme / ownership |
| **C. Feature** | `docs/contracts/REPORT_BRANDING_CONTRACT.md` | Report branding association |
| **C. Feature** | `docs/contracts/PHOTO_WORKSPACE_CONTRACT.md` | Photo / location evidence (implemented freeze) |
| **Backlog** | **`docs/ZLOG_PRODUCT_BACKLOG.md`** | Living issue tracker |

Related (do not weaken):

- `docs/PROTECTED_SITE_DIARY_CONTRACT.md` — Site Diary behavioural summary + regression gate pointer
- `docs/M0_SAVE_LIFECYCLE.md` — UPDATE-only final save
- `docs/SHARED_PHOTO_WORKSPACE_ARCHITECTURE.md` — photo architecture detail
- `docs/contracts/PENDING_APPROVAL_GAPS.md` — known mismatches awaiting user approval (**do not silently fix**)

## Conflict rule

**Contracts are append-only unless explicitly approved.**

If a future prompt conflicts with a contract, Cursor must **report the conflict** and ask for confirmation — not rewrite the contract to match its interpretation.

Example:

> The requested change conflicts with Section 3.4 of SITE_DIARY_SCREEN_CONTRACT.md. Please confirm you want to amend the contract.

Only after explicit approval may the contract be amended (prefer a dated append / “Supersedes” note; update Version metadata). Do not implement the conflicting product change until confirmed.

Where an older document conflicts with a **newer explicit user decision that also approved amending the contract**, the newer approved decision is authoritative. Record the conflict in the backlog / `PENDING_APPROVAL_GAPS.md` until resolved.

## Process

1. No silent removal / alteration of protected behaviour.
2. Classify change Level 1–4; Impact Report for Level 2+.
3. If more than one screen or major workflow → STOP for approval.
4. Feature freeze after Approved → Implemented → Tested → Accepted.
5. Minimum-diff only.
6. `npm run test:site-diary-contract` must prove **UI presence**, not helpers alone.
7. Completion reports must list contracts read, controls preserved/changed, and gate results.

Regression gate: `npm run test:site-diary-contract`
