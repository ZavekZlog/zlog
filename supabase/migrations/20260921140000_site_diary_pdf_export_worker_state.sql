-- Site Diary PDF export worker claim/lease state (Phase 2C-2A).
-- No worker process, Storage bucket, or application code in this migration.

ALTER TABLE public.site_diary_pdf_exports
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS reclaim_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.site_diary_pdf_exports
  DROP CONSTRAINT IF EXISTS site_diary_pdf_exports_reclaim_count_chk;

ALTER TABLE public.site_diary_pdf_exports
  ADD CONSTRAINT site_diary_pdf_exports_reclaim_count_chk
  CHECK (reclaim_count >= 0);

CREATE INDEX IF NOT EXISTS site_diary_pdf_exports_queued_created_idx
  ON public.site_diary_pdf_exports (created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS site_diary_pdf_exports_processing_lease_idx
  ON public.site_diary_pdf_exports (lease_expires_at ASC)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.claim_next_site_diary_pdf_export(
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_worker_id text;
  v_candidate public.site_diary_pdf_exports%ROWTYPE;
  v_row public.site_diary_pdf_exports%ROWTYPE;
  v_i integer;
BEGIN
  v_worker_id := trim(COALESCE(p_worker_id, ''));
  IF v_worker_id = '' THEN
    RAISE EXCEPTION 'Worker id is required';
  END IF;

  FOR v_i IN 1..100 LOOP
    SELECT e.*
    INTO v_candidate
    FROM public.site_diary_pdf_exports e
    WHERE e.status = 'queued'
       OR (
         e.status = 'processing'
         AND e.lease_expires_at IS NOT NULL
         AND e.lease_expires_at < now()
       )
    ORDER BY (e.status = 'processing')::integer ASC, e.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    IF v_candidate.status = 'processing' AND v_candidate.reclaim_count >= 3 THEN
      UPDATE public.site_diary_pdf_exports e
      SET
        status = 'failed',
        error_code = 'processing_timeout',
        error_message = 'PDF export timed out while processing.',
        completed_at = now(),
        lease_expires_at = NULL,
        locked_by = NULL,
        updated_at = now()
      WHERE e.id = v_candidate.id
        AND e.status = 'processing'
        AND e.lease_expires_at IS NOT NULL
        AND e.lease_expires_at < now()
        AND e.reclaim_count >= 3
      RETURNING * INTO v_row;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      CONTINUE;
    END IF;

    IF v_candidate.status = 'queued' THEN
      UPDATE public.site_diary_pdf_exports e
      SET
        status = 'processing',
        started_at = COALESCE(e.started_at, now()),
        lease_expires_at = now() + interval '20 minutes',
        locked_by = v_worker_id,
        updated_at = now()
      WHERE e.id = v_candidate.id
        AND e.status = 'queued'
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.site_diary_pdf_exports e
      SET
        lease_expires_at = now() + interval '20 minutes',
        locked_by = v_worker_id,
        reclaim_count = e.reclaim_count + 1,
        updated_at = now()
      WHERE e.id = v_candidate.id
        AND e.status = 'processing'
        AND e.lease_expires_at IS NOT NULL
        AND e.lease_expires_at < now()
        AND e.reclaim_count < 3
      RETURNING * INTO v_row;
    END IF;

    IF FOUND THEN
      RETURN to_jsonb(v_row);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_site_diary_pdf_export(
  p_export_id uuid,
  p_storage_path text,
  p_byte_size bigint,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_worker_id text;
  v_path text;
  v_row public.site_diary_pdf_exports%ROWTYPE;
BEGIN
  v_worker_id := trim(COALESCE(p_worker_id, ''));
  IF v_worker_id = '' THEN
    RAISE EXCEPTION 'Worker id is required';
  END IF;

  IF p_export_id IS NULL THEN
    RAISE EXCEPTION 'Export id is required';
  END IF;

  v_path := trim(COALESCE(p_storage_path, ''));
  IF v_path = '' THEN
    RAISE EXCEPTION 'Storage path is required';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size < 0 THEN
    RAISE EXCEPTION 'Invalid byte size';
  END IF;

  UPDATE public.site_diary_pdf_exports e
  SET
    status = 'ready',
    storage_path = v_path,
    byte_size = p_byte_size,
    completed_at = now(),
    updated_at = now(),
    lease_expires_at = NULL,
    locked_by = NULL,
    error_code = NULL,
    error_message = NULL
  WHERE e.id = p_export_id
    AND e.status = 'processing'
    AND e.locked_by = v_worker_id
    AND e.lease_expires_at IS NOT NULL
    AND e.lease_expires_at >= now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Export not found, not processing, lease expired, or worker mismatch';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_site_diary_pdf_export(
  p_export_id uuid,
  p_error_code text,
  p_error_message text,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_worker_id text;
  v_code text;
  v_message text;
  v_row public.site_diary_pdf_exports%ROWTYPE;
BEGIN
  v_worker_id := trim(COALESCE(p_worker_id, ''));
  IF v_worker_id = '' THEN
    RAISE EXCEPTION 'Worker id is required';
  END IF;

  IF p_export_id IS NULL THEN
    RAISE EXCEPTION 'Export id is required';
  END IF;

  v_code := trim(COALESCE(p_error_code, ''));
  IF v_code = '' THEN
    RAISE EXCEPTION 'Error code is required';
  END IF;

  v_message := left(trim(COALESCE(p_error_message, '')), 500);
  IF v_message = '' THEN
    v_message := 'PDF export could not be completed.';
  END IF;

  UPDATE public.site_diary_pdf_exports e
  SET
    status = 'failed',
    error_code = v_code,
    error_message = v_message,
    completed_at = now(),
    updated_at = now(),
    lease_expires_at = NULL,
    locked_by = NULL
  WHERE e.id = p_export_id
    AND e.status = 'processing'
    AND e.locked_by = v_worker_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Export not found, not processing, or worker mismatch';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_site_diary_pdf_export(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_site_diary_pdf_export(uuid, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_site_diary_pdf_export(uuid, text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_next_site_diary_pdf_export(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_site_diary_pdf_export(uuid, text, bigint, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.fail_site_diary_pdf_export(uuid, text, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.claim_next_site_diary_pdf_export(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_site_diary_pdf_export(uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_site_diary_pdf_export(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.claim_next_site_diary_pdf_export(text) IS
  'Service-role atomic claim of the next queued or stale Site Diary PDF export job (FOR UPDATE SKIP LOCKED).';
COMMENT ON FUNCTION public.complete_site_diary_pdf_export(uuid, text, bigint, text) IS
  'Service-role transition processing → ready for a locked, non-expired export job.';
COMMENT ON FUNCTION public.fail_site_diary_pdf_export(uuid, text, text, text) IS
  'Service-role transition processing → failed for a locked export job.';
