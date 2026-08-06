-- Project programme dates: planned completion (start_date already exists).
-- Reversible: DROP COLUMN planned_completion_date.
-- Safe for existing rows: nullable, no backfill.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planned_completion_date date;

COMMENT ON COLUMN public.projects.start_date IS
  'Project Start Date (date-only). Project Day 1 when set with planned_completion_date.';

COMMENT ON COLUMN public.projects.planned_completion_date IS
  'Planned Completion Date (date-only). Used with start_date for Project Day X of Y.';
