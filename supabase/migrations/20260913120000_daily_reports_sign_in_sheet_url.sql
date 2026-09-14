-- Durable sign-in sheet source evidence per Site Diary report (site-photos path).
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS sign_in_sheet_url text;

COMMENT ON COLUMN public.daily_reports.sign_in_sheet_url IS
  'Storage path in site-photos for the upright prepared sign-in register photo (evidence record).';
