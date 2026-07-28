-- Site Diary drafts: unfinished work vs saved reports
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_reports.is_draft IS
  'True while the diary is an unfinished draft; false after the user saves the report.';

CREATE INDEX IF NOT EXISTS daily_reports_project_draft_idx
  ON public.daily_reports (project_id, is_draft, created_at DESC);
