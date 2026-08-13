-- Daily shorthand records on Site Diary (feed Weekly H&S / Progress later).
-- Lightweight JSON arrays — not full investigation / RFI / commercial workflows.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS hs_incidents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS rfis jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS variations jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_reports.hs_incidents IS
  'Daily H&S incidents/observations: [{ id, description, actionTaken, assignedTo, status, photoUrl }]. status: Open|Closed. Future: Weekly H&S Report.';

COMMENT ON COLUMN public.daily_reports.rfis IS
  'Daily RFIs: [{ id, reference, description, raisedTo, status }]. status: Open|Responded|Closed. Future: Weekly Progress Report.';

COMMENT ON COLUMN public.daily_reports.variations IS
  'Daily variations: [{ id, reference, description, instructedBy, status }]. status: Identified|Instructed|Agreed|Closed. Future: Weekly Progress / QS.';
