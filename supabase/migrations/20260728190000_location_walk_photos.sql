-- Location-walk photos: sticky location + AI description across report types

-- Diary work photos
ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS location text;

COMMENT ON COLUMN public.report_photos.location IS
  'Site location when the photo was taken (e.g. Apartment 2.04)';

-- Snags: optional photo for location-walk captures
ALTER TABLE public.snags
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Survey / progress / H&S: JSON array of walk photos
-- [{ url, description, location, sequence }]
ALTER TABLE public.site_survey_reports
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.weekly_progress_reports
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.weekly_hs_reports
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
