# Zlog project rules

Zlog is a site diary and reporting app for UK construction, part of the Zavek suite. The owner (Colin Walker, known as Jim) is a site manager, not a developer. Explain what you did in plain English, give short step-by-step instructions for anything he must do himself, and never assume technical knowledge.

## How to work

1. Read before you change. For anything beyond a tiny fix, say what you plan to change and which files, then wait for approval.
2. Write or update the relevant document in `docs/` before changing code that follows it.
3. Do one job at a time. Do not mix unrelated changes in one commit.
4. After every change, say what changed, what you checked, and what is still unverified. Do not claim something works unless you ran it.
5. Do not invent facts about the app, the database or the live system. If you have not read it, say so.

## Git rules

- Work only on the branch you are given. Never commit to `main`.
- `main` deploys to production on Vercel. Merging to `main` is Jim's decision, and only after the checklist below is complete.
- Push only the current branch. Never force push. Never rewrite history.
- Run git commands one at a time, not chained.
- Do not commit `.env` files, keys, passwords, tokens, PDFs used for checking (such as `check.pdf`), or `live-function.sql`.
- `live-function.sql` is a local copy of the live database function, kept as the rollback reference. Do not commit, edit or delete it.

## Database rules (Supabase)

- The dev server on port 3001 uses the LIVE database. Treat every save as real.
- Never query, change or inspect the live database yourself. Do not use keys from `.env` to call Supabase. If you need to know what is live, ask Jim to run a query and paste the result.
- Database changes go in a migration file in `supabase/migrations/`. Jim applies them by hand in the Supabase SQL editor. Never apply them yourself.
- The live function `finalize_site_diary_save` has 8 inputs ending in `p_attendance`. `CREATE OR REPLACE` only replaces a function when the argument types are identical. A different argument list creates a second function beside the live one, which already happened once and had to be dropped.
- So before writing any change to that function: start from the exact live text, keep the same argument list, keep `SECURITY DEFINER` and `SET search_path`, and never use `DROP FUNCTION` in a migration.
- Never trust a truncated argument list. Compare the full text.
- Each migration comes with a check query Jim can run afterwards, and a statement of what to expect.

## Merge checklist (all must be true before `main`)

1. Any migration for the work has been applied to the live database and its check query passed.
2. A real save has been tested on the laptop and survives a refresh.
3. PDF changes have been checked on real exports from the PDF worker, not guessed from code.
4. Tests pass.
5. Jim has agreed.

## PDF report rules

The two documents below are the source of truth. If anything in this file differs from them, the documents win. Read both in full before touching anything in the PDF, and do not rely on the short reminders here.

- `docs/ZLOG_PDF_DESIGN_RULES.md` (layout, colours, sections, photographs, declaration)
- `docs/contracts/REPORT_BRANDING_CONTRACT.md` (branding)

Short reminders only:

- Branding comes only from the company issuing the report, never the end client.
- The banner uses the sampled brand colour on every page, exactly as the documents define, including how red, white, silver and grey are handled. No branding gives `#6E6E6E`.
- Red may appear only in the header banner area. Nowhere below it.
- Never paint report chrome with Zlog orange `#FF5000` or diary violet `#8B5CF6`.
- Do not add colours, accents or decoration that are not in the documents.
- Photographs, permits, the attendance register, the Summary boxes and the closing Declaration and Signature block all follow the design rules document exactly.

## Report content rules

- Follow every quantity with "nr" (for example "1 nr").
- The subcontractors-on-site field counts subcontractors, not operatives. Operatives are on the attendance register.
- Every report ends with Jim's signature and a date, in the form the design rules document sets out.
- Photographs are evidence: identical frames, shown whole, never cropped, numbered and captioned, laid out as the design rules document says.
- If Jim says to omit something from a report, do not assume it does not exist on site. Never turn an omission into "No".
- The Visitors section is called "Visitors".

## Product protection

Zlog is confidential and is being set up as a company. Do not publish code, share the repo, add it to public services, or paste source into public tools. Do not add third-party services or packages without asking.

## Known open items (check before assuming they are done)

- The summary-box migration (`20261122120000_daily_reports_summary_boxes.sql`) must be applied to the live database before new Summary fields persist.
- The attendance migration `20261010180000_report_attendance.sql` exists only in other working copies and is not committed anywhere.
- The saved-diary viewer still uses the old summary layout.
- A silent `#FF5000` default colour (which the branding contract forbids) and the colour-sampling fallback for uploaded logos need review.
