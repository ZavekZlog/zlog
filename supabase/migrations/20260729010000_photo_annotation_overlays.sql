-- Transparent photo annotation overlay storage
-- Original photograph remains in url/storage_path unchanged.
-- annotations = structured JSON (source of truth for editing)
-- overlay_path = optional transparent PNG derived from annotations
-- flattened_path = optional export-only composite (PDF/export); never the only copy

ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS annotations jsonb,
  ADD COLUMN IF NOT EXISTS overlay_path text,
  ADD COLUMN IF NOT EXISTS flattened_path text;

COMMENT ON COLUMN public.report_photos.annotations IS
  'Structured annotation shapes (normalized coords). Source of truth for the transparent overlay.';
COMMENT ON COLUMN public.report_photos.overlay_path IS
  'Optional transparent PNG overlay path in site-photos bucket.';
COMMENT ON COLUMN public.report_photos.flattened_path IS
  'Optional derived flatten for export/PDF only — not a replacement for the original.';
