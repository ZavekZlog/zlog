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

Full rules are in `docs/ZLOG_PDF_DESIGN_RULES.md`, and branding rules are in `docs/contracts/REPORT_BRANDING_CONTRACT.md`. Read both before touching anything in the PDF. The key points:

- The header banner uses the reporting company's sampled brand colour exactly, any hue. With no branding, use `#6E6E6E`.
- Table and section top lines use the exact brand colour, except pigeon grey `#E4E2DE` when the brand is red-dominant, lighter than luminance 0.30, or absent.
- Red appears only in the header banner and logo.
- Grid lines are neutral `#C6C7C8` at 0.8pt.
- Branding comes only from the company issuing the report. Never from the end client.
- Summary section: full-width "Site works achieved today" first. "Deliveries" and "Delays and issues" sit side by side. "Welfare" is full width if present. Blank boxes are left out. Older diaries with only prose print one "Summary" box.
- Do not add colours, accents or decoration that are not in the rules.

## Report content rules

- Follow every quantity with "nr" (for example "1 nr").
- The subcontractors-on-site field counts subcontractors, not operatives. Operatives are on the attendance register.
- Every report ends with a Sign Off box containing Jim's signature and a date.
- Photographs are evidence: identical frames, shown whole, never cropped, about four per page, numbered and captioned.
- Always include the attendance register photograph. Use only work photographs, plus the permit to work photograph when one applies.
- Daily Site Checks and Site Records appear as set out in the PDF design rules.
- If Jim says to omit something from a report, do not assume it does not exist on site. Never turn an omission into "No".
- The Visitors section is called "Visitors".

## Product protection

Zlog is confidential and is being set up as a company. Do not publish code, share the repo, add it to public services, or paste source into public tools. Do not add third-party services or packages without asking.

## Known open items (check before assuming they are done)

- The summary-box migration (`20261122120000_daily_reports_summary_boxes.sql`) must be applied to the live database before new Summary fields persist.
- The attendance migration `20261010180000_report_attendance.sql` exists only in other working copies and is not committed anywhere.
- The saved-diary viewer still uses the old summary layout.
- A silent `#FF5000` default colour and the colour-sampling fallback for uploaded logos need review.
