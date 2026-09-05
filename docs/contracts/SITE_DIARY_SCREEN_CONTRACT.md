# Site Diary — Screen Contract

**Layer:** B — Screen  
**Version:** 1.21.0
**Date Updated:** 2026-09-05
**Reason Updated:** Setup hierarchy is Project Details first, then Reporting Company, Reporting On Behalf Of, Author, Cover Photo
**User Decision:** APPROVED — Android visual test of new setup section order
**Previous Version:** 1.20.3

**Status:** Binding production contract  
**Routes:**

- Hub: `/dashboard/diary` (Today’s Report: Start a new diary / Use a previous diary)
- Setup: `/dashboard/diary/setup`
- Diary form: `/dashboard/project/[id]/diary`
- Saved diary viewer (read-only): `/dashboard/project/[id]/diary/view?report=…`

**Supersedes (UI order / Shift):** Informal notes and `docs/ZLOG_FUNCTIONAL_SPEC_V1.md` passages that still list shift as Day / Night / Weekend / Half day. **Authoritative shift options are Day / Back / Night.**

**Supersedes (v1.1.x §5 dashboard entry):** Dashboard Site Diary opens the **hub** (`/dashboard/diary`), not setup directly.

**Supersedes (v1.1.x §2 setup sequence):** Locked hierarchy is Project Details → Reporting Company → Reporting On Behalf Of → Author → Cover Photo (Project Name is first inside Project Details; Project Manager remains inside Project Details only).

Parent: `docs/PROTECTED_PRODUCT_DECISIONS.md`  
Behaviour summary: `docs/PROTECTED_SITE_DIARY_CONTRACT.md`  
Backlog: `docs/ZLOG_PRODUCT_BACKLOG.md`  
Gate: `npm run test:site-diary-contract`  
Global UI: `docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md` (intentional design; text must fit; mobile visual QA required)  
Release Gate: `docs/ZLOG_RELEASE_GATE.md` (mandatory — feature incomplete until all six QA gates pass)

---

## 1. No silent removal

A protected control or behaviour on these screens may not be removed, hidden, renamed, moved, disabled, made conditional, replaced, reinterpreted, or disconnected from persistence unless the user **explicitly** requested that exact change.

Refactoring, cleanup, simplification, deduplication, modernisation, “better UX”, or “consistency” are **not** authorisation.

---

## 1A. Module accent identity

The Site Diary module uses the canonical diary accent from `REPORT_THEMES.diary.accent`
(`139,92,246` / `#8B5CF6`). That identity remains consistent across the hub, creation,
setup, editing, saved-list, read-only review, completion, Photo Evidence, Signature and
other Site Diary sub-page states.

**Module accent colour follows module identity and remains consistent across that module’s
creation, editing, review, saved-record and sub-page states. Interaction mode must not
redefine the module accent.**

Review/read-only state is communicated through wording, available controls and interaction
state—not by assigning a different module colour. Orange remains a brand/primary-action
colour; blue remains the Site Survey module accent. Neither replaces the Site Diary accent.

---

## 2. Setup screen — approved control sequence

Route: `/dashboard/diary/setup`  
New-diary title: **New Site Diary**
Navigation: visible **Back** control (to Site Diary hub).

For an existing diary opened on its saved Report Date of today:

- Title: **Project & Report Details**
- Load all saved report-specific values and linked project/reusable values before display.
- The user may scan and continue without re-entering or reconfirming unchanged values.
- Primary CTA: **Continue to Today's Diary**
- Continue updates and opens the **same report ID** in the editable workbench (`?compose=1`).
- Opening this screen must not create a report or reset any diary content.

### PROJECT DETAILS

1. **Project Name** — single control for project choice:
   - Select / choose an **existing** project name → load that project’s remembered project fields from `public.projects` and retain `project_id`
   - Type a **new** project name → create a new project on Continue (no leak from a prior selection)
2. **Project Address**
3. **Project Manager** — must remain inside Project Details
4. **Working Days per Week**
5. **Current Phase** — diary/report-specific; starts blank for a genuinely new diary and never hydrates from the project
6. **Project Description** — once implemented (not in live schema yet)
7. **Project Start Date**
8. **Planned Completion Date**
9. **Shift** — options exactly: **Day**, **Back**, **Night**
10. **Report Date**
11. **Project Reference** where currently approved on this screen

### REPORTING COMPANY

12. **Reporting Company Name** — from the signed-in user’s company branding profile when available  
13. **Reporting Company Logo** — branding / logo for who is producing the report

### REPORTING ON BEHALF OF

14. **Reporting On Behalf Of** — client / main contractor / organisation; on a genuinely new diary, prefill the signed-in user’s most recently used value and keep it fully editable

### AUTHOR

15. **Author Name** — from explicitly saved profile author name only (`users.full_name` / auth `user_metadata.full_name`); never from email, username, or a previous diary  
16. **Author Role** — free text from explicit profile job title when present; never invent a role

### COVER PHOTO

Cover photo remains on this setup screen after Author.

New-diary primary CTA: **Continue to Site Diary**

### UI language (mandatory)

User-visible copy must never include implementation terms such as: sticky, sticky fields, persistent, persistence, stored values, inherited values, database fields, cached project information, “remembered for this project”.

Setup introduction (exact): **Confirm the details for today's Site Diary, then continue.**

Do not show helper lines that explain persistence (for example “Programme dates for this project”).

---

## 3. Distinct flow contracts (no stale state)

| Flow | Contract |
|------|----------|
| **A. Start a new diary** | Hub → setup; preselect the signed-in user’s last-used project when it still exists, while keeping Project Name editable/selectable; Author Name prefills from profile; Reporting On Behalf Of prefills from the signed-in user’s most recently used value and remains editable; Report Date may be today; approved default branding / company name may load |
| **B. Select existing project** | Via **Project Name** matching an existing project; load remembered project fields from `public.projects`; keep `project_id`; do **not** copy diary content |
| **C. Use a previous diary** | **Not a hub choice.** Reuse lives on the opened saved diary as **Use as Basis for New Diary**. It creates a **new** diary ID from that diary (appropriate reusable fields only) via `createTodaysDiaryDraft`, then opens that new diary’s populated **Project & Report Details** for review before the workbench — never straight into compose; Author from profile, not source; the source diary is never modified |
| **D. View saved diary** | Tapping a Saved Diaries row opens the read-only saved-diary viewer (§4A): the whole record on one continuous page, no compose/edit controls on open. **Share Report**, **Edit This Diary**, **Use as Basis for New Diary**, and confirmed **Delete Diary** live on that opened screen. **Edit This Diary** keeps the same diary ID — today’s diary through its Project & Report Details pre-flight, a historical diary in explicit Edit. **Delete Diary** is visually separated and quiet, confirmed, and returns to the saved list |
| **E. Edit saved diary** | Same diary ID; rehydrate saved values; no duplicate; save → View |

State from one flow must not leak into another.

---

## 4. Diary form screen (saved / draft)

Route: `/dashboard/project/[id]/diary?report=…`  
Modes: View (`?report=`) · Edit (`?edit=1` or draft)

Protected interactions:

- Open today’s existing diary → populated Project & Report Details (no write on open) → same-ID editable workbench
- Open historical diary → View (no write)
- **Edit This Diary** → same ID
- **Use as Basis for New Diary** → new ID
- Save → same diary in View; no Recent Diaries list on open report page
- In-progress workbench content (Weather, H&S / RFIs / Variations, summary, visitors, delays, actions, equipment on hire, Temporary Works) autosaves onto the **same** `daily_reports` id after a short pause. It never creates a row, never writes `is_draft`, and never marks the diary finished. **Save / Share** remains the explicit complete/share action and flushes pending content first.
- Autosave status (unobtrusive, near Save / Share): **Saving your work…** / **Work saved** / **Work not saved. Check your connection.** A failed or offline write must not be shown as saved.
- Reopening that same in-progress diary hydrates the last successfully autosaved content. **Start a New Diary** is unchanged and still creates a new id.
- Branding not forced in normal Edit
- Summary optional
- Plant / daily content isolated by report ID
- Temporary Works & Scaffolding Checks records and explicit applicable / N/A choice reload by report ID
- Project association retained; Project Day visible when dates exist
- Shift reloads from `daily_reports.shift`
- Saved work areas show their saved photos and captions by default, using the area’s saved 1 / 4 / 6 review density.
- Saved work areas remain in review presentation until **Edit** is chosen; the blank Add Work Area editor is not presented as part of a saved area.
- **Expand / Collapse** is absent because the saved photographic record is already visible.

---

## 4A. Saved diary viewer (read-only artifact)

Route: `/dashboard/project/[id]/diary/view?report=…`  
Reached by tapping a Saved Diaries row. This is a finished historical record, not an editor.

**Must:**

- Present the diary as **one complete, continuous document on a single vertically scrolling page**.
- Render, in this order: Project & Report Details (project · reporting · this report, including **Current Phase**) → Cover Photo → Weather → H&S Incidents / Observations → RFIs → Variations → Site Summary → Labour on Site → Plant → Equipment on Hire → Temporary Works & Scaffolding Checks → Visitors → Delays & Issues → Actions Required → Photo Evidence → Signature.
- Show every saved photograph with its caption by default, at the area’s saved 1 / 4 / 6 review density, numbered continuously across the document.
- Read **Current Phase** from `daily_reports.current_phase` for that diary. `projects.current_phase` is never read.
- Show `Not recorded` where the diary genuinely holds no value, so blank never reads as broken.
- Opening and reviewing perform **no writes** and create no rows.
- Keep **Back** visible and usable throughout the continuous review using a compact, opaque sticky action area within the existing report width. The report scrolls normally beneath it. The large page title and report content are not frozen.
- Do not show a redundant **Saved Site Diary** shell heading above sticky Back. Diary identity is the project name and date line beneath Back.

**Must not:**

- Reuse the compose/edit workflow, or present any data-entry field, Take Photo, Upload, Add Another Area, Save Area, Continue, or Save control.
- Hide any part of the diary behind a button that leaves the page. Project & Report Details is simply the first section of the same artifact.
- Offer Expand / Collapse.

**Onward actions (v1.20.3):** **Share Report** (does not write the diary; generates the existing PDF behind the scenes, then native-shares the file where supported; `PrimaryCTA` `surface="workbench"` — restrained rust-perimeter plate, not landing powder-coat), **Edit This Diary** (same diary ID, composition workflow), **Use as Basis for New Diary** (new ID via existing `createTodaysDiaryDraft` → Project & Report Details; source unchanged), and **Delete Diary** (`DestructiveButton` destructive-border treatment, visually separated, never one-tap; confirmed with count-aware copy; then return to the saved-diary list). Productive actions sit together as a compact group; Delete is separated below. Do not freeze the action group with Back. See `docs/contracts/REPORT_DELETION_CONTRACT.md`.

Supersedes v1.12.0 “exactly one — Edit This Diary”. Share Report remains on the viewer.

Permits and deliveries are named in hub copy but are **not** saved diary fields today; the viewer does not invent them.

### Temporary Works & Scaffolding Checks

**FROZEN — approved production behaviour.**

Workbench position (after Equipment on hire, before Visitors):

Equipment on hire → Temporary Works & Scaffolding Checks → Visitors

Applicability (exactly these labels):

- **Temporary works apply today**
- **Not applicable today**

When **Not applicable today** is selected: no further Temporary Works input is required; records are cleared only after confirmation if any already exist; the section persists and reports as not applicable; PDF omits an empty schedule.

When **Temporary works apply today** is selected, the user may add, edit and delete multiple items. Each item uses:

- Temporary Works Type — Scaffold · Hoarding · Excavation support · Temporary propping · Edge protection · Access platform · Formwork / falsework · Other
- Location / Description
- Status — In place · Inspected · Modified · Removed · Issue identified
- TWC / TWS / Reference — optional
- Check Result — Satisfactory · Action required
- Notes / Action

Scaffold-only fields (shown only when Type = Scaffold):

- Scaffold check / inspection status — Checked today — satisfactory · Formal inspection current · Issue identified · Not checked today
- Scaffold tag / inspection reference — optional

Persistence:

- Report-owned on `daily_reports.temporary_works_applicable` and `daily_reports.temporary_works`
- Survives Save Site Diary, reopen, Edit This Diary, saved review, and PDF regenerate
- Inline edits follow the established diary pattern and are persisted by **Save Site Diary**

Saved viewer / PDF:

- Saved viewer shows recorded items, or a concise Not applicable today state
- PDF flattens recorded items into the existing Temporary Works & Scaffolding Checks schedule columns and section banner. N/A produces no empty schedule.
- Do not invent a separate Temporary Works PDF visual language

Canonical helpers: `lib/diary-daily-records.js`, `components/diary/DiaryTemporaryWorksSection.jsx`. Gate: `lib/diary-daily-records.test.js`, `lib/diary-saved-view.test.js`, `lib/diary-share-workflow.test.js`.

---

## 4B. PDF export — Save PDF interaction

Save PDF on the completion screen must give the user control of the saved file. It is the only
action permitted to write a file to the device.

**Must:**

- Offer the platform **Save As** dialog (`window.showSaveFilePicker`) wherever the browser supports
  it, so the user picks the destination folder, accepts or edits the filename, and explicitly
  confirms the save.
- Supply `Zlog-Site-Diary-<report-date>.pdf` as the **editable** suggested name, never as a forced name.
- Treat dialog cancellation as a cancellation: no file written, no error, no success message.
- Fall back to the browser's own download only where the picker is unavailable or refuses
  (no secure context, expired user gesture, enterprise policy).

**Must not:**

- Replace the Save As dialog with an automatic download as the default path.
- Auto-download on page load, on save, or from Share / Email / WhatsApp.

Any change that routes Save PDF straight to the browser download path is a **regression**, not a
simplification. Gate: `lib/diary-share-workflow.test.js`.

---

## 5. Hub screen and Dashboard entry

**Dashboard → Site Diary** opens **`/dashboard/diary`** (Today’s Report hub).

The hub contains **exactly two equal cards**, side by side on desktop and stacked on mobile
(`repeat(auto-fit, minmax(240px, 1fr))`). Neither is visually preferred, and neither is demoted
to a secondary action:

| Position | Card | Supporting text |
|----------|------|-----------------|
| Left | **Start a New Diary** | Start a fresh diary with your saved details ready. |
| Right | **View Saved Diaries** | Review past diaries or choose one to continue your next. |

The two cards are peers and **render at equal height** (`docs/contracts/GLOBAL_UI_TEXT_FIT_CONTRACT.md` §2.1).
The longer supporting sentence sets the row height; it is never clipped or shortened to match its neighbour.

- **Start a New Diary** → `/dashboard/diary/setup` (clears setup session draft; blank init for today)
- **View Saved Diaries** → the saved-diary list. Opening the list creates, copies and updates nothing.
  Each entry is a compact, information-dense tappable row, not a dashboard card. It shows project name (primary), report date, shift, and the existing short summary where useful.
  - Tapping anywhere on the row opens that exact report in the read-only saved-diary viewer (§4A).
  - The list has no **Open to review**, **Use for Today**, or **Delete** controls on individual rows.
  - Helper copy is exactly: **Tap a diary to open and review it.**
  - Project name/date/shift remain readable and wrap safely; the row has no horizontal overflow. The whole row is the tap target.
- Saved-list deletion does not live on browsing rows. Confirmed **Delete Diary** lives on the opened viewer (§5A). There is no browsing-surface **Select** mode.

**Use a Previous Diary is not a hub card.** Reuse lives on the opened saved diary as **Use as Basis for New Diary**. Removing the card must not remove or break the reuse
implementation.

---

## 5A. Saved-diary deletion (v1.19.0)

Feature contract: `docs/contracts/REPORT_DELETION_CONTRACT.md`.

**Must:**

- Keep hub wording **View Saved Diaries**.
- Keep the Saved Diaries list as browsing only: each compact row opens review; no per-row management buttons.
- Never delete on one tap. Confirmation shows the actual count (`Delete Diary` / `Delete 6 Diaries` and `Permanently delete this saved diary?` / `Permanently delete these 6 saved diaries?`).
- Keep **Cancel** on the confirmation. Cancel deletes nothing.
- Keep one compact sticky contextual bar above the list while scrolling, holding **Back** and **Tap a diary to open and review it.** It does not expose **Select**. The bar sticks below the viewport top, stays opaque, and the title/header does not stick.
- On the opened saved diary, offer **Delete Diary** as a quiet separated control, lower emphasis than Share Report / Edit / Use as Basis; after confirm, return to the saved list.
- Keep **Back** reachable while scrolling the opened diary via the established compact sticky treatment. Do not freeze the large title or report body.
- Delete the real diary-owned rows and safe diary-owned Storage objects. Do not delete the project or shared assets still referenced elsewhere.
- Leave remaining diaries visible.

**Must not:**

- Require a separate **Select** / checkbox / **Select All** browsing workflow for ordinary deletion.
- Put Delete, Use as Basis, or Edit on Saved Diaries list rows.
- Use the previous project-page sequential client deletes (`report_photos` then labour then plant then `daily_reports`, then best-effort Storage remove).

Canonical helper: `lib/report-deletion.js`. Canonical RPC: `delete_site_diaries`.

---

## 6. Completion checklist (every Site Diary task)

- Contracts read (this file + product + relevant feature contracts)
- Protected items affected listed
- Controls preserved vs intentionally changed
- `npm run test:site-diary-contract` result
- Full regression result
- Exact files changed
- Confirmation: no unrelated control disappeared; no unrelated persistence path changed
- Manual mobile verification

A task is complete only when the change works **and** protected controls, order, and persistence remain intact.
