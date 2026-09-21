-- Private Storage bucket for durable Site Diary PDF export artifacts (Phase 2D-1).
-- Does not modify export job table/RPCs or worker application code.
--
-- Worker uploads via service_role (bypasses storage.objects RLS).
-- End-user download is intended to flow through a future authorized server/API
-- signed-URL handoff — not public or broad authenticated Storage listing.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-diary-pdf-exports',
  'site-diary-pdf-exports',
  false,
  104857600,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
