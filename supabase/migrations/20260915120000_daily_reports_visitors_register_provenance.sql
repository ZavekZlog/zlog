-- Durable source identity for Visitors created from Attendance Register moves.
-- Does not replace visible daily_reports.visitors text.
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS visitors_register_provenance jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_reports.visitors_register_provenance IS
  'Scan-derived visitor provenance from Attendance Register moves (evidence storage path + register source_row). Parallel to visitors text; not shown in PDF.';
