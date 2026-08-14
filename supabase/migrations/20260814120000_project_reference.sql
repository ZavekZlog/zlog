-- Sticky Project Reference (project-level recurring metadata).
-- Additive only. Do not replay older migrations.
-- Reversible:
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS project_reference;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_reference text;

COMMENT ON COLUMN public.projects.project_reference IS
  'Project Reference / job number (sticky). Shown on Site Diary setup for this project until edited. Not a per-diary content field.';
