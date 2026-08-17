# Report Deletion Contract

**Layer:** C — Feature  
**Version:** 1.2.0
**Date Updated:** 2026-08-17  
**Reason Updated:** Make the sticky management area a single shared surface that carries Select in normal browsing and the selection controls in Select mode
**User Decision:** APPROVED — tightly bounded View Saved Diaries presentation and interaction-density redesign; deletion backend remains unchanged
**Previous Version:** 1.1.0

**Status:** Binding production contract for deleting saved reports  
**First host:** Site Diary saved-diary list, saved-diary viewer, and project-page recent diary entries  
**Parent:** `docs/PROTECTED_PRODUCT_DECISIONS.md`  
**Screen:** `docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md`  
**Gate:** `lib/report-deletion.test.js`, `lib/diary-site-diary-contract.test.js`

---

## 1. Product rule (reusable)

Every saved-report module must let the owner **really delete** report-owned data. Hiding a row, soft-delete flags, or client-only removal are not deletion.

This rule applies first to Site Diary and is the required pattern for future report modules (Snag, Survey, Progress, H&S) unless a later approved contract supersedes it for that module.

**Must:**

- Delete the real parent report and its report-owned child records.
- Require an explicit Select / delete action. Never delete on a single tap.
- Confirm with the actual count before destroying anything.
- Keep a visible **Cancel** control that closes the confirmation without deleting.
- After a confirmed opened-report delete, return the user to that module’s saved list.
- Leave remaining reports visible and unchanged.
- Leave project records, shared branding, other modules, and other users’ reports untouched.

**Must not:**

- Delete a project because a report on it was deleted.
- Delete Storage objects that are still legitimately referenced elsewhere.
- Delete shared company/project logos because a report snapshot pointed at them.
- Use Storage-first deletion, sequential client child deletes, or best-effort DB cleanup.

---

## 2. Confirmation copy

Canonical helper: `lib/report-deletion.js`  
Canonical dialog: `components/report-management/ReportDeletionDialog.jsx`

| Count | Action label | Confirmation |
|-------|--------------|--------------|
| 1 | Delete Diary | Permanently delete this saved diary? |
| n | Delete n Diaries | Permanently delete these n saved diaries? |

Future modules reuse the same helper with their own singular/plural labels. The dialog always offers **Cancel** and the count-aware confirm action. “This cannot be undone.” is part of the dialog, not a substitute for the count.

---

## 3. Site Diary surfaces

### Saved-diary list (`/dashboard/diary`, View Saved Diaries)

- Hub wording stays **View Saved Diaries**.
- Saved records use compact, restrained list rows rather than dashboard-style cards.
- Each row shows project name first, then report date and shift, with the existing short summary where useful.
- In normal mode, the record information is the large **Open to review** tap target; **Use for Today** is a clear compact trailing action. Neither action is swipe-only or hidden behind an overflow menu.
- Checkboxes are absent until the user chooses **Select**.
- **Select All** selects every currently listed diary.
- **Delete Selected** is disabled until at least one diary is selected.
- **Open to review** and **Use for Today** remain on each entry and keep their approved behaviour.
- Selection mode replaces navigation actions with a clear full-row checkbox target, selected-row treatment, and live `{count} selected` status.
- One compact management bar remains sticky below the viewport top while scrolling. In normal browsing it carries **Select**; in Select mode the same bar carries the live count, **Cancel**, **Select All**, and the count-aware delete action. It is fully opaque, does not duplicate into a second sticky bar, and does not freeze the page title.

### Opened saved diary (`/dashboard/project/[id]/diary/view`)

- **Delete Diary** is visually separated from **Generate PDF** and **Edit This Diary**.
- Generate PDF and Edit This Diary remain.
- Confirmed delete returns to the saved-diary list (`?view=saved`).

### Project page recent entries (`/dashboard/project/[id]`)

- Existing **View** and **Use as Basis for New Diary** remain.
- The previous client-side sequential delete is replaced by the same safe RPC path and confirmation dialog.
- Do not add a second deletion architecture on this page.

---

## 4. Database deletion

Canonical RPC: `public.delete_site_diaries(uuid[])`

| Rule | Contract |
|------|----------|
| Auth | Session required (`auth.uid()`). Unauthenticated calls fail. |
| Ownership | Every requested ID must belong to a project owned by `auth.uid()`. |
| Atomicity | All-or-none. Missing, foreign, or extra IDs reject the whole request. |
| Batch | 1–50 IDs. |
| Parent | `DELETE FROM daily_reports` for the locked owned IDs. |
| Children | `report_labour`, `report_plant`, and `report_photos` are removed by their existing `ON DELETE CASCADE` foreign keys. Location Walk evidence lives on `report_photos`, not a separate table. JSONB on the parent (equipment, H&S, RFIs, variations, temporary works) goes with the parent row. |
| Never deleted | `projects`, `site_sign_ins`, `company_brandings`, other diaries, snags, survey/progress/H&S reports, auth users |

PostgreSQL cascade does **not** delete Storage objects. Storage cleanup is a separate durable step.

---

## 5. Storage cleanup and reference safety

Canonical outbox: `public.report_storage_cleanup_jobs`  
Canonical follow-up RPC: `public.mark_report_storage_cleanup(uuid[], text)`  
Client processor: `deleteSiteDiaries()` in `lib/report-deletion.js`

**Order (required):**

1. Queue only **safe** report-owned Storage paths into the outbox.
2. Delete the database parent (children cascade) in the same transaction.
3. After DB success, the client attempts `site-photos` removal for queued paths.
4. Mark those jobs completed, or leave them pending with the error if Storage fails.

Database success is authoritative. A Storage failure must not restore a partially deleted diary and must not drop the cleanup work.

**A path is safe to queue only when all are true:**

- It is a non-URL object path under `{auth.uid()}/`
- It came from the deleted diary’s cover, signature, or `report_photos` url / storage_path / overlay_path / flattened_path
- No remaining `daily_reports` row still stores it as cover, signature, or brand logo
- No remaining `report_photos` row still stores it
- It is not `projects.logo_url`, `company_brandings.logo_url`, or `snags.photo_url`
- It is not still referenced in survey / progress / H&S JSONB photo arrays

`brand_logo_url` on a diary is a snapshot/reference. It is never a deletion candidate.

---

## 6. Client helper

`deleteSiteDiaries(supabase, ids)` is the only product path for Site Diary deletion.

**Must not:**

- Delete `report_photos` / `report_labour` / `report_plant` / `daily_reports` from the browser as a sequence of statements
- Call Storage `remove` before the RPC succeeds
- Treat a Storage failure as a failed diary delete after the RPC has already committed

---

## 7. Tests

Focused: `lib/report-deletion.test.js`  
Site Diary regression: `lib/diary-site-diary-contract.test.js`, `lib/diary-saved-view.test.js`

A passing source-string gate is not visual QA. Authenticated delete of a real saved diary remains manual QA.

---

## 8. Saved-report management presentation (reusable)

The Site Diary list establishes the required presentation pattern for future saved-report modules. This section authorises no other module implementation.

**Dashboard vs management:**

- Dashboard/module entry surfaces may use expressive cards.
- Saved-report management surfaces use compact, highly legible record rows designed for fast scanning.

**Every future saved-report list must:**

- Prioritise project/report identity, date, and report-specific context.
- Aim to show approximately 5–7 records on a normal phone viewport where content permits, without tiny text or undersized touch targets.
- Use restrained separators or row containers instead of large decorative card spacing.
- Keep primary record opening obvious and provide efficient, visibly labelled secondary actions.
- Avoid swipe-only actions, obscure gestures, horizontal scrolling, and unnecessary truncation of project/date identity.
- Keep touch targets at least 44px and text readable in outdoor/mobile conditions.
- Use explicit **Select**, per-row selection, **Select All**, live selected count, count-aware delete, and confirmation before deletion.
- Provide exactly one sticky management area per saved-report list. It carries the minimal normal-state control (**Select**) and becomes the selection controls when Select is activated.
- Keep that sticky area compact, opaque, and offset from viewport edges; it must not obscure records or device/browser navigation.

If optional summary text is constrained for density, project name, date, shift, and action labels remain fully legible. Visual/mobile inspection is required because source contracts cannot prove geometry or records-per-screen.
