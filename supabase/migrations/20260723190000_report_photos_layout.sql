-- Photo PDF layout tiers: full | grid4 | grid6
ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS layout text DEFAULT 'grid4';

COMMENT ON COLUMN public.report_photos.layout IS
  'PDF layout tier: full (1/page), grid4 (2x2), grid6 (3x2)';
