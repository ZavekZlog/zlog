-- Multi-company PDF branding profiles + branding_id on all report types
-- Apply in Supabase SQL editor or via: supabase db push

-- ---------------------------------------------------------------------------
-- company_brandings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_brandings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  logo_url text,
  brand_color text NOT NULL DEFAULT '#FF5000',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_brandings_user_id_idx
  ON public.company_brandings(user_id);

-- At most one default branding per user
CREATE UNIQUE INDEX IF NOT EXISTS company_brandings_one_default_per_user
  ON public.company_brandings(user_id)
  WHERE is_default = true;

ALTER TABLE public.company_brandings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_brandings_select_own" ON public.company_brandings;
CREATE POLICY "company_brandings_select_own" ON public.company_brandings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_brandings_insert_own" ON public.company_brandings;
CREATE POLICY "company_brandings_insert_own" ON public.company_brandings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_brandings_update_own" ON public.company_brandings;
CREATE POLICY "company_brandings_update_own" ON public.company_brandings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "company_brandings_delete_own" ON public.company_brandings;
CREATE POLICY "company_brandings_delete_own" ON public.company_brandings FOR DELETE
  USING (auth.uid() = user_id);

-- Attach branding to existing report tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS branding_id uuid REFERENCES public.company_brandings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

-- snags may pre-exist without a local migration; ensure table then add columns
CREATE TABLE IF NOT EXISTS public.snags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text,
  location text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.snags
  ADD COLUMN IF NOT EXISTS branding_id uuid REFERENCES public.company_brandings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

-- ---------------------------------------------------------------------------
-- Minimal tables for the other three report types (branding-ready)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_survey_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text,
  branding_id uuid REFERENCES public.company_brandings(id) ON DELETE SET NULL,
  brand_color text,
  brand_logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text,
  branding_id uuid REFERENCES public.company_brandings(id) ON DELETE SET NULL,
  brand_color text,
  brand_logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_hs_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text,
  branding_id uuid REFERENCES public.company_brandings(id) ON DELETE SET NULL,
  brand_color text,
  brand_logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_survey_reports_project_id_idx ON public.site_survey_reports(project_id);
CREATE INDEX IF NOT EXISTS weekly_progress_reports_project_id_idx ON public.weekly_progress_reports(project_id);
CREATE INDEX IF NOT EXISTS weekly_hs_reports_project_id_idx ON public.weekly_hs_reports(project_id);

ALTER TABLE public.site_survey_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_hs_reports ENABLE ROW LEVEL SECURITY;

-- Project-owner RLS (mirrors daily_reports)
DROP POLICY IF EXISTS "site_survey_reports_all_own" ON public.site_survey_reports;
CREATE POLICY "site_survey_reports_all_own" ON public.site_survey_reports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = site_survey_reports.project_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = site_survey_reports.project_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "weekly_progress_reports_all_own" ON public.weekly_progress_reports;
CREATE POLICY "weekly_progress_reports_all_own" ON public.weekly_progress_reports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = weekly_progress_reports.project_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = weekly_progress_reports.project_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "weekly_hs_reports_all_own" ON public.weekly_hs_reports;
CREATE POLICY "weekly_hs_reports_all_own" ON public.weekly_hs_reports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = weekly_hs_reports.project_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = weekly_hs_reports.project_id AND p.owner_id = auth.uid()
  ));
