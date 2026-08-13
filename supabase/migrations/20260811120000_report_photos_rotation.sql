-- Persist Location Walk manual rotation (0 / 90 / 180 / 270) with each photo.
ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS rotation_degrees integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.report_photos.rotation_degrees IS
  'Manual display rotation in degrees: 0, 90, 180, or 270. Applied in UI preview and PDF.';
