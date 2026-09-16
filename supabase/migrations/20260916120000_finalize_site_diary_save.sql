-- Atomic Site Diary final save (daily_reports + labour + plant + photos + cleanup outbox).
-- Storage API deletion remains client-side after commit.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.report_photos
    GROUP BY report_id, url
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create report_photos(report_id, url) uniqueness: duplicate rows exist. Inspect legacy duplicates before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS report_photos_report_id_url_uidx
  ON public.report_photos (report_id, url);

CREATE OR REPLACE FUNCTION public.finalize_site_diary_save(
  p_report_id uuid,
  p_project_id uuid,
  p_report_patch jsonb,
  p_labour jsonb,
  p_plant jsonb,
  p_photos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_dr public.daily_reports%ROWTYPE;
  v_jobs jsonb := '[]'::jsonb;
  v_labour_count integer := 0;
  v_plant_count integer := 0;
  v_photo_count integer := 0;
  v_elem jsonb;
  v_url text;
  v_desired_urls text[] := ARRAY[]::text[];
  v_has_permits boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_report_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'Report and project are required';
  END IF;

  SELECT dr.*
  INTO v_dr
  FROM public.daily_reports dr
  INNER JOIN public.projects p ON p.id = dr.project_id
  WHERE dr.id = p_report_id
    AND dr.project_id = p_project_id
    AND p.owner_id = v_user_id
  FOR UPDATE OF dr;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or not authorised';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_reports'
      AND column_name = 'permits'
  )
  INTO v_has_permits;

  IF p_report_patch IS NOT NULL AND jsonb_typeof(p_report_patch) <> 'object' THEN
    RAISE EXCEPTION 'Report patch must be a JSON object';
  END IF;

  IF p_report_patch IS NOT NULL THEN
    UPDATE public.daily_reports dr
    SET
      report_number = CASE
        WHEN p_report_patch ? 'report_number' THEN p_report_patch->>'report_number'
        ELSE dr.report_number
      END,
      report_date = CASE
        WHEN p_report_patch ? 'report_date' THEN (p_report_patch->>'report_date')::date
        ELSE dr.report_date
      END,
      weather = CASE
        WHEN p_report_patch ? 'weather' THEN p_report_patch->>'weather'
        ELSE dr.weather
      END,
      shift = CASE
        WHEN p_report_patch ? 'shift' THEN p_report_patch->>'shift'
        ELSE dr.shift
      END,
      site_summary = CASE
        WHEN p_report_patch ? 'site_summary' THEN p_report_patch->>'site_summary'
        ELSE dr.site_summary
      END,
      visitors = CASE
        WHEN p_report_patch ? 'visitors' THEN p_report_patch->>'visitors'
        ELSE dr.visitors
      END,
      visitors_register_provenance = CASE
        WHEN p_report_patch ? 'visitors_register_provenance'
          THEN COALESCE(p_report_patch->'visitors_register_provenance', '[]'::jsonb)
        ELSE dr.visitors_register_provenance
      END,
      delays_issues = CASE
        WHEN p_report_patch ? 'delays_issues' THEN p_report_patch->>'delays_issues'
        ELSE dr.delays_issues
      END,
      actions = CASE
        WHEN p_report_patch ? 'actions' THEN p_report_patch->>'actions'
        ELSE dr.actions
      END,
      company_reporting_for = CASE
        WHEN p_report_patch ? 'company_reporting_for' THEN p_report_patch->>'company_reporting_for'
        ELSE dr.company_reporting_for
      END,
      creator_name = CASE
        WHEN p_report_patch ? 'creator_name' THEN p_report_patch->>'creator_name'
        ELSE dr.creator_name
      END,
      creator_role = CASE
        WHEN p_report_patch ? 'creator_role' THEN p_report_patch->>'creator_role'
        ELSE dr.creator_role
      END,
      cover_photo_url = CASE
        WHEN p_report_patch ? 'cover_photo_url' THEN p_report_patch->>'cover_photo_url'
        ELSE dr.cover_photo_url
      END,
      cover_processing_version = CASE
        WHEN p_report_patch ? 'cover_processing_version' THEN p_report_patch->>'cover_processing_version'
        ELSE dr.cover_processing_version
      END,
      signature_url = CASE
        WHEN p_report_patch ? 'signature_url' THEN p_report_patch->>'signature_url'
        ELSE dr.signature_url
      END,
      branding_id = CASE
        WHEN p_report_patch ? 'branding_id' THEN NULLIF(p_report_patch->>'branding_id', '')::uuid
        ELSE dr.branding_id
      END,
      brand_color = CASE
        WHEN p_report_patch ? 'brand_color' THEN p_report_patch->>'brand_color'
        ELSE dr.brand_color
      END,
      brand_logo_url = CASE
        WHEN p_report_patch ? 'brand_logo_url' THEN p_report_patch->>'brand_logo_url'
        ELSE dr.brand_logo_url
      END,
      equipment_hire = CASE
        WHEN p_report_patch ? 'equipment_hire'
          THEN COALESCE(p_report_patch->'equipment_hire', '[]'::jsonb)
        ELSE dr.equipment_hire
      END,
      hs_incidents = CASE
        WHEN p_report_patch ? 'hs_incidents'
          THEN COALESCE(p_report_patch->'hs_incidents', '[]'::jsonb)
        ELSE dr.hs_incidents
      END,
      rfis = CASE
        WHEN p_report_patch ? 'rfis'
          THEN COALESCE(p_report_patch->'rfis', '[]'::jsonb)
        ELSE dr.rfis
      END,
      variations = CASE
        WHEN p_report_patch ? 'variations'
          THEN COALESCE(p_report_patch->'variations', '[]'::jsonb)
        ELSE dr.variations
      END,
      temporary_works_applicable = CASE
        WHEN p_report_patch ? 'temporary_works_applicable'
          THEN (p_report_patch->>'temporary_works_applicable')::boolean
        ELSE dr.temporary_works_applicable
      END,
      temporary_works = CASE
        WHEN p_report_patch ? 'temporary_works'
          THEN COALESCE(p_report_patch->'temporary_works', '[]'::jsonb)
        ELSE dr.temporary_works
      END,
      permits = CASE
        WHEN v_has_permits AND p_report_patch ? 'permits'
          THEN COALESCE(p_report_patch->'permits', '[]'::jsonb)
        ELSE dr.permits
      END
    WHERE dr.id = p_report_id;

    SELECT * INTO v_dr FROM public.daily_reports WHERE id = p_report_id;
  END IF;

  IF p_labour IS NOT NULL THEN
    IF jsonb_typeof(p_labour) <> 'array' THEN
      RAISE EXCEPTION 'Labour payload must be a JSON array';
    END IF;

    DELETE FROM public.report_labour WHERE report_id = p_report_id;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_labour) AS value
    LOOP
      INSERT INTO public.report_labour (
        owner_id,
        report_id,
        company,
        trade,
        count,
        hours,
        notes,
        sequence
      ) VALUES (
        v_user_id,
        p_report_id,
        NULLIF(v_elem->>'company', ''),
        NULLIF(v_elem->>'trade', ''),
        NULLIF(v_elem->>'count', '')::numeric,
        NULLIF(v_elem->>'hours', '')::numeric,
        NULLIF(v_elem->>'notes', ''),
        COALESCE(NULLIF(v_elem->>'sequence', '')::integer, 0)
      );
      v_labour_count := v_labour_count + 1;
    END LOOP;
  END IF;

  IF p_plant IS NOT NULL THEN
    IF jsonb_typeof(p_plant) <> 'array' THEN
      RAISE EXCEPTION 'Plant payload must be a JSON array';
    END IF;

    DELETE FROM public.report_plant WHERE report_id = p_report_id;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_plant) AS value
    LOOP
      INSERT INTO public.report_plant (
        owner_id,
        report_id,
        item,
        ref,
        status,
        notes,
        sequence
      ) VALUES (
        v_user_id,
        p_report_id,
        NULLIF(v_elem->>'item', ''),
        NULLIF(v_elem->>'ref', ''),
        NULLIF(v_elem->>'status', ''),
        NULLIF(v_elem->>'notes', ''),
        COALESCE(NULLIF(v_elem->>'sequence', '')::integer, 0)
      );
      v_plant_count := v_plant_count + 1;
    END LOOP;
  END IF;

  IF p_photos IS NOT NULL THEN
    IF jsonb_typeof(p_photos) <> 'array' THEN
      RAISE EXCEPTION 'Photo payload must be a JSON array';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT btrim(COALESCE(elem.value->>'url', '')) AS url
        FROM jsonb_array_elements(p_photos) AS elem(value)
      ) urls
      WHERE url = ''
    ) THEN
      RAISE EXCEPTION 'Each desired photo row requires a non-blank canonical url';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT btrim(COALESCE(elem.value->>'url', '')) AS url
        FROM jsonb_array_elements(p_photos) AS elem(value)
      ) urls
      GROUP BY url
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicate photo url in desired set';
    END IF;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_photos) AS value
    LOOP
      v_url := btrim(COALESCE(v_elem->>'url', ''));
      IF v_url = '' THEN
        RAISE EXCEPTION 'Each desired photo row requires a canonical url';
      END IF;
      v_desired_urls := array_append(v_desired_urls, v_url);

      INSERT INTO public.report_photos (
        owner_id,
        report_id,
        url,
        caption,
        location,
        category,
        sequence,
        layout,
        rotation_degrees,
        assigned_to,
        thumbnail_path,
        report_width,
        report_height,
        thumbnail_width,
        thumbnail_height,
        report_byte_size,
        thumbnail_byte_size,
        processing_version
      ) VALUES (
        v_user_id,
        p_report_id,
        v_url,
        NULLIF(v_elem->>'caption', ''),
        NULLIF(v_elem->>'location', ''),
        NULLIF(v_elem->>'category', ''),
        NULLIF(v_elem->>'sequence', '')::integer,
        COALESCE(NULLIF(v_elem->>'layout', ''), 'grid4'),
        COALESCE(NULLIF(v_elem->>'rotation_degrees', '')::integer, 0),
        NULLIF(v_elem->>'assigned_to', ''),
        NULLIF(v_elem->>'thumbnail_path', ''),
        NULLIF(v_elem->>'report_width', '')::integer,
        NULLIF(v_elem->>'report_height', '')::integer,
        NULLIF(v_elem->>'thumbnail_width', '')::integer,
        NULLIF(v_elem->>'thumbnail_height', '')::integer,
        NULLIF(v_elem->>'report_byte_size', '')::bigint,
        NULLIF(v_elem->>'thumbnail_byte_size', '')::bigint,
        NULLIF(v_elem->>'processing_version', '')
      )
      ON CONFLICT (report_id, url) DO UPDATE SET
        caption = CASE
          WHEN v_elem ? 'caption' THEN NULLIF(v_elem->>'caption', '')
          ELSE public.report_photos.caption
        END,
        location = CASE
          WHEN v_elem ? 'location' THEN NULLIF(v_elem->>'location', '')
          ELSE public.report_photos.location
        END,
        category = CASE
          WHEN v_elem ? 'category' THEN NULLIF(v_elem->>'category', '')
          ELSE public.report_photos.category
        END,
        sequence = CASE
          WHEN v_elem ? 'sequence' THEN NULLIF(v_elem->>'sequence', '')::integer
          ELSE public.report_photos.sequence
        END,
        layout = CASE
          WHEN v_elem ? 'layout' THEN COALESCE(NULLIF(v_elem->>'layout', ''), 'grid4')
          ELSE public.report_photos.layout
        END,
        rotation_degrees = CASE
          WHEN v_elem ? 'rotation_degrees'
            THEN COALESCE(NULLIF(v_elem->>'rotation_degrees', '')::integer, 0)
          ELSE public.report_photos.rotation_degrees
        END,
        assigned_to = CASE
          WHEN v_elem ? 'assigned_to' THEN NULLIF(v_elem->>'assigned_to', '')
          ELSE public.report_photos.assigned_to
        END,
        thumbnail_path = CASE
          WHEN v_elem ? 'thumbnail_path' THEN NULLIF(v_elem->>'thumbnail_path', '')
          ELSE public.report_photos.thumbnail_path
        END,
        report_width = CASE
          WHEN v_elem ? 'report_width' THEN NULLIF(v_elem->>'report_width', '')::integer
          ELSE public.report_photos.report_width
        END,
        report_height = CASE
          WHEN v_elem ? 'report_height' THEN NULLIF(v_elem->>'report_height', '')::integer
          ELSE public.report_photos.report_height
        END,
        thumbnail_width = CASE
          WHEN v_elem ? 'thumbnail_width' THEN NULLIF(v_elem->>'thumbnail_width', '')::integer
          ELSE public.report_photos.thumbnail_width
        END,
        thumbnail_height = CASE
          WHEN v_elem ? 'thumbnail_height' THEN NULLIF(v_elem->>'thumbnail_height', '')::integer
          ELSE public.report_photos.thumbnail_height
        END,
        report_byte_size = CASE
          WHEN v_elem ? 'report_byte_size' THEN NULLIF(v_elem->>'report_byte_size', '')::bigint
          ELSE public.report_photos.report_byte_size
        END,
        thumbnail_byte_size = CASE
          WHEN v_elem ? 'thumbnail_byte_size' THEN NULLIF(v_elem->>'thumbnail_byte_size', '')::bigint
          ELSE public.report_photos.thumbnail_byte_size
        END,
        processing_version = CASE
          WHEN v_elem ? 'processing_version' THEN NULLIF(v_elem->>'processing_version', '')
          ELSE public.report_photos.processing_version
        END;
    END LOOP;

    WITH doomed AS (
      SELECT rp.id, rp.url, rp.thumbnail_path
      FROM public.report_photos rp
      WHERE rp.report_id = p_report_id
        AND NOT (rp.url = ANY (COALESCE(v_desired_urls, ARRAY[]::text[])))
    ),
    candidates AS (
      SELECT d.id AS doomed_id, path_value.object_path
      FROM doomed d
      CROSS JOIN LATERAL (
        VALUES (d.url), (d.thumbnail_path)
      ) AS path_value(object_path)
      WHERE path_value.object_path IS NOT NULL
        AND btrim(path_value.object_path) <> ''
    ),
    safe_candidates AS (
      SELECT DISTINCT
        p_report_id AS report_id,
        c.object_path
      FROM candidates c
      WHERE c.object_path LIKE v_user_id::text || '/%'
        AND c.object_path !~* '^(https?:|data:|blob:)'
        AND NOT EXISTS (
          SELECT 1
          FROM public.daily_reports self_dr
          WHERE self_dr.id = p_report_id
            AND c.object_path IN (
              self_dr.cover_photo_url,
              self_dr.signature_url,
              self_dr.brand_logo_url
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.daily_reports other
          WHERE other.id <> p_report_id
            AND c.object_path IN (
              other.cover_photo_url,
              other.signature_url,
              other.brand_logo_url
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.report_photos other_photo
          WHERE other_photo.report_id <> p_report_id
            AND c.object_path IN (
              other_photo.url,
              other_photo.thumbnail_path
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.report_photos keep_photo
          WHERE keep_photo.report_id = p_report_id
            AND keep_photo.url = ANY (COALESCE(v_desired_urls, ARRAY[]::text[]))
            AND c.object_path IN (keep_photo.url, keep_photo.thumbnail_path)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.projects p
          WHERE c.object_path = p.logo_url
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.company_brandings b
          WHERE c.object_path = b.logo_url
        )
    )
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
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.report_storage_cleanup_jobs existing_job
      WHERE existing_job.owner_id = v_user_id
        AND existing_job.report_module = 'site-diary'
        AND existing_job.report_id = safe.report_id
        AND existing_job.bucket_id = 'site-photos'
        AND existing_job.object_path = safe.object_path
        AND existing_job.status = 'pending'
    );

    DELETE FROM public.report_photos rp
    WHERE rp.report_id = p_report_id
      AND NOT (rp.url = ANY (COALESCE(v_desired_urls, ARRAY[]::text[])));

    SELECT count(*)::integer INTO v_photo_count
    FROM public.report_photos
    WHERE report_id = p_report_id;
  END IF;

  SELECT * INTO v_dr FROM public.daily_reports WHERE id = p_report_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', j.id, 'path', j.object_path)
      ORDER BY j.created_at
    ),
    '[]'::jsonb
  )
  INTO v_jobs
  FROM public.report_storage_cleanup_jobs j
  WHERE j.owner_id = v_user_id
    AND j.report_module = 'site-diary'
    AND j.report_id = p_report_id
    AND j.bucket_id = 'site-photos'
    AND j.status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'report_id', p_report_id,
    'project_id', p_project_id,
    'report', to_jsonb(v_dr),
    'labour_count', v_labour_count,
    'plant_count', v_plant_count,
    'photo_count', v_photo_count,
    'cleanupJobs', v_jobs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_site_diary_save(uuid, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_site_diary_save(uuid, uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.finalize_site_diary_save(uuid, uuid, jsonb, jsonb, jsonb, jsonb) IS
  'Ownership-checked atomic Site Diary final save. Queues report-photo Storage cleanup jobs inside the same transaction; client removes Storage after commit.';
