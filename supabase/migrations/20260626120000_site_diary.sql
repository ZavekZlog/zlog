-- Site Diary Report schema + site-photos storage bucket
-- Apply in Supabase SQL editor or via: supabase db push

-- ---------------------------------------------------------------------------
-- projects: ensure columns used by new-project flow
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS site_address text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  shift_type text,
  site_summary text,
  visitors text,
  delays_issues text,
  actions_required text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_reports_project_id_idx ON public.daily_reports(project_id);
CREATE INDEX IF NOT EXISTS daily_reports_report_date_idx ON public.daily_reports(report_date DESC);

-- ---------------------------------------------------------------------------
-- report_labour (dynamic rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_labour (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  trade text,
  company text,
  headcount integer,
  hours numeric(6, 2),
  notes text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS report_labour_report_id_idx ON public.report_labour(report_id);

-- ---------------------------------------------------------------------------
-- report_plant (dynamic rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_plant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  plant_type text,
  quantity integer,
  hours numeric(6, 2),
  notes text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS report_plant_report_id_idx ON public.report_plant(report_id);

-- ---------------------------------------------------------------------------
-- report_photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  sequence_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_photos_report_id_idx ON public.report_photos(report_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_labour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_plant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_photos ENABLE ROW LEVEL SECURITY;

-- daily_reports: access via project owner
DROP POLICY IF EXISTS "daily_reports_select_own" ON public.daily_reports;
CREATE POLICY "daily_reports_select_own" ON public.daily_reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = daily_reports.project_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "daily_reports_insert_own" ON public.daily_reports;
CREATE POLICY "daily_reports_insert_own" ON public.daily_reports FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = daily_reports.project_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "daily_reports_update_own" ON public.daily_reports;
CREATE POLICY "daily_reports_update_own" ON public.daily_reports FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = daily_reports.project_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "daily_reports_delete_own" ON public.daily_reports;
CREATE POLICY "daily_reports_delete_own" ON public.daily_reports FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = daily_reports.project_id AND p.owner_id = auth.uid()
  ));

-- report_labour
DROP POLICY IF EXISTS "report_labour_all_own" ON public.report_labour;
CREATE POLICY "report_labour_all_own" ON public.report_labour FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_labour.report_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_labour.report_id AND p.owner_id = auth.uid()
  ));

-- report_plant
DROP POLICY IF EXISTS "report_plant_all_own" ON public.report_plant;
CREATE POLICY "report_plant_all_own" ON public.report_plant FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_plant.report_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_plant.report_id AND p.owner_id = auth.uid()
  ));

-- report_photos
DROP POLICY IF EXISTS "report_photos_all_own" ON public.report_photos;
CREATE POLICY "report_photos_all_own" ON public.report_photos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_photos.report_id AND p.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.daily_reports r
    JOIN public.projects p ON p.id = r.project_id
    WHERE r.id = report_photos.report_id AND p.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Storage bucket: site-photos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-photos',
  'site-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "site_photos_select_own" ON storage.objects;
CREATE POLICY "site_photos_select_own" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'site-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "site_photos_insert_own" ON storage.objects;
CREATE POLICY "site_photos_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "site_photos_delete_own" ON storage.objects;
CREATE POLICY "site_photos_delete_own" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
