-- Current Phase is diary/report-specific, not project-level.
-- The legacy public.projects.current_phase column is retained so this ownership
-- correction is non-destructive; Site Diary no longer reads or writes it.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS current_phase text;

COMMENT ON COLUMN public.daily_reports.current_phase IS
  'Current phase recorded for this individual Site Diary. Not inherited from the project.';
