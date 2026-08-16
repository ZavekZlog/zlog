-- Site Diary temporary works and scaffolding checks.
-- Applicability is nullable so a new diary is not silently recorded as N/A.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS temporary_works_applicable boolean;

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS temporary_works jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_reports.temporary_works_applicable IS
  'True when temporary works apply, false when explicitly marked N/A, null when not answered.';

COMMENT ON COLUMN public.daily_reports.temporary_works IS
  'Daily temporary works and scaffolding checks: [{ id, item, location, status, notes }].';
