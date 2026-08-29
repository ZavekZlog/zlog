-- Phase C1: nullable prepared-cover pipeline marker on daily_reports.
-- Additive — legacy rows remain valid with cover_processing_version NULL.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS cover_processing_version text;

COMMENT ON COLUMN public.daily_reports.cover_processing_version IS
  'Pipeline id that produced the prepared cover at cover_photo_url (e.g. zlog-cover-pipeline-v1). Null for legacy/raw/unprepared covers.';
