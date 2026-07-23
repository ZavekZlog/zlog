-- Equipment on hire for site diary reports
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS equipment_hire jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_reports.equipment_hire IS
  'Array of hire items: [{ description, supplier, quantity, status }]';
