-- Phase 1: report metadata columns (additive only — no changes to existing columns)
-- Apply in Supabase SQL editor or via: supabase db push

ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS company_reporting_for text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS creator_name text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS creator_role text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS cover_photo_url text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS signature_url text;
