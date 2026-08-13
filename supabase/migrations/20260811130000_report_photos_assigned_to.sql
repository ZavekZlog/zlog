-- Optional per-photo responsibility label for Location Walk / PDF tiles.
ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS assigned_to text;

COMMENT ON COLUMN public.report_photos.assigned_to IS
  'Optional contractor / company / person responsible for the item shown in this photo.';
