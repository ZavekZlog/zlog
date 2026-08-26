-- Phase C: durable prepared report asset + thumbnail metadata on report_photos.
-- Additive / nullable — legacy rows remain valid with thumbnail_path NULL.
-- Also include thumbnail_path in Site Diary deletion Storage cleanup candidates.

ALTER TABLE public.report_photos
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS report_width integer,
  ADD COLUMN IF NOT EXISTS report_height integer,
  ADD COLUMN IF NOT EXISTS thumbnail_width integer,
  ADD COLUMN IF NOT EXISTS thumbnail_height integer,
  ADD COLUMN IF NOT EXISTS report_byte_size integer,
  ADD COLUMN IF NOT EXISTS thumbnail_byte_size integer,
  ADD COLUMN IF NOT EXISTS processing_version text;

COMMENT ON COLUMN public.report_photos.thumbnail_path IS
  'Optional private storage path for the lightweight review thumbnail (JPEG). Null for legacy raw photos.';
COMMENT ON COLUMN public.report_photos.report_width IS
  'Pixel width of the durable report-quality asset referenced by url.';
COMMENT ON COLUMN public.report_photos.report_height IS
  'Pixel height of the durable report-quality asset referenced by url.';
COMMENT ON COLUMN public.report_photos.thumbnail_width IS
  'Pixel width of the review thumbnail asset.';
COMMENT ON COLUMN public.report_photos.thumbnail_height IS
  'Pixel height of the review thumbnail asset.';
COMMENT ON COLUMN public.report_photos.report_byte_size IS
  'Byte size of the durable report-quality asset.';
COMMENT ON COLUMN public.report_photos.thumbnail_byte_size IS
  'Byte size of the review thumbnail asset.';
COMMENT ON COLUMN public.report_photos.processing_version IS
  'Pipeline id that produced prepared assets (e.g. zlog-photo-pipeline-v1). Null for legacy.';

-- Recreate delete_site_diaries so thumbnail_path is queued for Storage cleanup.
-- Body matches 20260817070000 with thumbnail_path added to photo path candidates.
CREATE OR REPLACE FUNCTION public.delete_site_diaries(p_report_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ids uuid[];
  v_requested_count integer;
  v_owned_count integer;
  v_deleted_count integer;
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT array_agg(id ORDER BY id)
  INTO v_ids
  FROM (
    SELECT DISTINCT unnest_id AS id
    FROM unnest(COALESCE(p_report_ids, ARRAY[]::uuid[])) AS unnest_id
    WHERE unnest_id IS NOT NULL
  ) requested;

  v_requested_count := COALESCE(cardinality(v_ids), 0);
  IF v_requested_count < 1 OR v_requested_count > 50 THEN
    RAISE EXCEPTION 'Choose between 1 and 50 saved diaries';
  END IF;

  -- Lock the exact parent rows and reject the whole request if any ID is
  -- missing or belongs to another user. No partial bulk delete is permitted.
  PERFORM dr.id
  FROM public.daily_reports dr
  JOIN public.projects p ON p.id = dr.project_id
  WHERE dr.id = ANY(v_ids)
    AND p.owner_id = v_user_id
  FOR UPDATE OF dr;

  SELECT count(*)
  INTO v_owned_count
  FROM public.daily_reports dr
  JOIN public.projects p ON p.id = dr.project_id
  WHERE dr.id = ANY(v_ids)
    AND p.owner_id = v_user_id;

  IF v_owned_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more saved diaries could not be deleted';
  END IF;

  -- Queue only report-owned objects under the authenticated user's folder.
  -- Reusable branding/project logos are never candidates. A candidate is also
  -- excluded while any remaining diary/report/module still references it.
  WITH candidates AS (
    SELECT dr.id AS report_id, path_value.object_path
    FROM public.daily_reports dr
    CROSS JOIN LATERAL (
      VALUES (dr.cover_photo_url), (dr.signature_url)
    ) AS path_value(object_path)
    WHERE dr.id = ANY(v_ids)

    UNION ALL

    SELECT rp.report_id, path_value.object_path
    FROM public.report_photos rp
    CROSS JOIN LATERAL (
      VALUES
        (to_jsonb(rp)->>'url'),
        (to_jsonb(rp)->>'storage_path'),
        (to_jsonb(rp)->>'overlay_path'),
        (to_jsonb(rp)->>'flattened_path'),
        (to_jsonb(rp)->>'thumbnail_path')
    ) AS path_value(object_path)
    WHERE rp.report_id = ANY(v_ids)
  ),
  safe_candidates AS (
    SELECT
      (array_agg(c.report_id ORDER BY c.report_id))[1] AS report_id,
      c.object_path
    FROM candidates c
    WHERE c.object_path IS NOT NULL
      AND btrim(c.object_path) <> ''
      AND c.object_path LIKE v_user_id::text || '/%'
      AND c.object_path !~* '^(https?:|data:|blob:)'
      AND NOT EXISTS (
        SELECT 1
        FROM public.daily_reports other
        WHERE other.id <> ALL(v_ids)
          AND c.object_path IN (
            other.cover_photo_url,
            other.signature_url,
            other.brand_logo_url
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.report_photos other_photo
        WHERE other_photo.report_id <> ALL(v_ids)
          AND c.object_path IN (
            to_jsonb(other_photo)->>'url',
            to_jsonb(other_photo)->>'storage_path',
            to_jsonb(other_photo)->>'overlay_path',
            to_jsonb(other_photo)->>'flattened_path',
            to_jsonb(other_photo)->>'thumbnail_path'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE c.object_path = to_jsonb(p)->>'logo_url'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_brandings b
        WHERE c.object_path = b.logo_url
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.snags s
        WHERE c.object_path = to_jsonb(s)->>'photo_url'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.site_survey_reports r
        WHERE jsonb_typeof(COALESCE(r.photos, '[]'::jsonb)) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.photos, '[]'::jsonb)) photo
            WHERE c.object_path = photo->>'url'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_progress_reports r
        WHERE jsonb_typeof(COALESCE(r.photos, '[]'::jsonb)) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.photos, '[]'::jsonb)) photo
            WHERE c.object_path = photo->>'url'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_hs_reports r
        WHERE jsonb_typeof(COALESCE(r.photos, '[]'::jsonb)) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.photos, '[]'::jsonb)) photo
            WHERE c.object_path = photo->>'url'
          )
      )
    GROUP BY c.object_path
  ),
  inserted AS (
    INSERT INTO public.report_storage_cleanup_jobs (
      owner_id,
      report_module,
      report_id,
      bucket_id,
      object_path
    )
    SELECT
      v_user_id,
      'site-diary',
      safe.report_id,
      'site-photos',
      safe.object_path
    FROM safe_candidates safe
    RETURNING id, object_path
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', id, 'path', object_path)),
    '[]'::jsonb
  )
  INTO v_jobs
  FROM inserted;

  DELETE FROM public.daily_reports
  WHERE id = ANY(v_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> v_requested_count THEN
    RAISE EXCEPTION 'Saved diary deletion was incomplete';
  END IF;

  RETURN jsonb_build_object(
    'deletedIds', to_jsonb(v_ids),
    'cleanupJobs', v_jobs
  );
END;
$$;

COMMENT ON FUNCTION public.delete_site_diaries(uuid[]) IS
  'Ownership-checked, all-or-none deletion of up to 50 Site Diaries. Child rows cascade; safe Storage paths (including prepared thumbnails) are queued.';
