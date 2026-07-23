-- Site sign-in register (daily labour source for diary import)
CREATE TABLE IF NOT EXISTS public.site_sign_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  person_name text,
  trade text,
  company text,
  hours numeric(6, 2),
  signed_in_at timestamptz,
  signed_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_sign_ins_project_date_idx
  ON public.site_sign_ins (project_id, work_date);

COMMENT ON TABLE public.site_sign_ins IS
  'Site attendance / sign-in register. Diary labour import filters strictly by work_date.';

ALTER TABLE public.site_sign_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_sign_ins_all_own" ON public.site_sign_ins;
CREATE POLICY "site_sign_ins_all_own" ON public.site_sign_ins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = site_sign_ins.project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = site_sign_ins.project_id AND p.owner_id = auth.uid()
    )
  );
