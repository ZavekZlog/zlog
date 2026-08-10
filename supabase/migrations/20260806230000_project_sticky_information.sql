-- Sticky project information (Phase 1).
-- Additive only. Do not replay older migrations.
-- Reversible:
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS client_pm;
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS working_days_per_week;
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS current_phase;
--
-- Project Address reuses existing public.projects.site_address (no new column).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_pm text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS working_days_per_week smallint;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS current_phase text;

COMMENT ON COLUMN public.projects.site_address IS
  'Project Address (sticky). Shown on reports for this project until edited.';

COMMENT ON COLUMN public.projects.client_pm IS
  'Project Manager (sticky). Stored as client_pm; UI label is Project Manager. Not a diary field.';

COMMENT ON COLUMN public.projects.working_days_per_week IS
  'Working days per week (sticky). Whole number 1–7 when set; null when unset.';

COMMENT ON COLUMN public.projects.current_phase IS
  'Current Phase (sticky). Free-text project phase label.';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_working_days_per_week_range;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_working_days_per_week_range
  CHECK (
    working_days_per_week IS NULL
    OR (working_days_per_week >= 1 AND working_days_per_week <= 7)
  );
