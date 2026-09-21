-- Durable Site Diary PDF export job state (Phase 2C-1).
-- No worker, Storage bucket, or PDF generation in this migration.

CREATE TABLE IF NOT EXISTS public.site_diary_pdf_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content_fingerprint text NOT NULL,
  snapshot_version integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  storage_bucket text NOT NULL DEFAULT 'site-diary-pdf-exports',
  storage_path text,
  byte_size bigint,
  error_code text,
  error_message text,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT site_diary_pdf_exports_fingerprint_format_chk
    CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT site_diary_pdf_exports_status_chk
    CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  CONSTRAINT site_diary_pdf_exports_snapshot_version_chk
    CHECK (snapshot_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS site_diary_pdf_exports_active_uidx
  ON public.site_diary_pdf_exports (report_id, content_fingerprint)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS site_diary_pdf_exports_owner_created_idx
  ON public.site_diary_pdf_exports (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS site_diary_pdf_exports_report_fingerprint_idx
  ON public.site_diary_pdf_exports (report_id, content_fingerprint, status);

COMMENT ON TABLE public.site_diary_pdf_exports IS
  'Durable async Site Diary PDF export jobs keyed by report_id + SITE_DIARY_PDF_SNAPSHOT_V1 content fingerprint.';

ALTER TABLE public.site_diary_pdf_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_diary_pdf_exports_select_own"
  ON public.site_diary_pdf_exports;
CREATE POLICY "site_diary_pdf_exports_select_own"
  ON public.site_diary_pdf_exports
  FOR SELECT
  USING (owner_id = auth.uid());

REVOKE ALL ON TABLE public.site_diary_pdf_exports FROM PUBLIC;
GRANT SELECT ON TABLE public.site_diary_pdf_exports TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_site_diary_pdf_export(
  p_report_id uuid,
  p_content_fingerprint text,
  p_snapshot_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
  v_row public.site_diary_pdf_exports%ROWTYPE;
  v_attempt integer;
  v_fp text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report is required';
  END IF;

  v_fp := lower(trim(COALESCE(p_content_fingerprint, '')));
  IF v_fp IS NULL OR v_fp !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid content fingerprint';
  END IF;

  IF p_snapshot_version IS NULL OR p_snapshot_version < 1 THEN
    RAISE EXCEPTION 'Invalid snapshot version';
  END IF;

  SELECT dr.project_id, p.owner_id
  INTO v_project_id, v_owner_id
  FROM public.daily_reports dr
  INNER JOIN public.projects p ON p.id = dr.project_id
  WHERE dr.id = p_report_id
    AND p.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or not authorised';
  END IF;

  SELECT e.*
  INTO v_row
  FROM public.site_diary_pdf_exports e
  WHERE e.report_id = p_report_id
    AND e.content_fingerprint = v_fp
    AND e.status = 'ready'
  ORDER BY e.completed_at DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  SELECT e.*
  INTO v_row
  FROM public.site_diary_pdf_exports e
  WHERE e.report_id = p_report_id
    AND e.content_fingerprint = v_fp
    AND e.status IN ('queued', 'processing')
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  SELECT COALESCE(MAX(e.attempt), 0) + 1
  INTO v_attempt
  FROM public.site_diary_pdf_exports e
  WHERE e.report_id = p_report_id
    AND e.content_fingerprint = v_fp;

  BEGIN
    INSERT INTO public.site_diary_pdf_exports (
      report_id,
      owner_id,
      project_id,
      content_fingerprint,
      snapshot_version,
      status,
      storage_bucket,
      attempt
    )
    VALUES (
      p_report_id,
      v_owner_id,
      v_project_id,
      v_fp,
      p_snapshot_version,
      'queued',
      'site-diary-pdf-exports',
      v_attempt
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT e.*
      INTO v_row
      FROM public.site_diary_pdf_exports e
      WHERE e.report_id = p_report_id
        AND e.content_fingerprint = v_fp
        AND e.status IN ('queued', 'processing')
      ORDER BY e.created_at DESC
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE;
      END IF;
  END;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_site_diary_pdf_export(
  p_export_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.site_diary_pdf_exports%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_export_id IS NULL THEN
    RAISE EXCEPTION 'Export id is required';
  END IF;

  SELECT e.*
  INTO v_row
  FROM public.site_diary_pdf_exports e
  WHERE e.id = p_export_id
    AND e.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Export not found or not authorised';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_site_diary_pdf_export(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_site_diary_pdf_export(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_site_diary_pdf_export(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_diary_pdf_export(uuid) TO authenticated;

COMMENT ON FUNCTION public.enqueue_site_diary_pdf_export(uuid, text, integer) IS
  'Ownership-checked idempotent enqueue for Site Diary PDF export jobs. Database state only.';
COMMENT ON FUNCTION public.get_site_diary_pdf_export(uuid) IS
  'Ownership-checked read of one Site Diary PDF export job row. No Storage URLs.';
