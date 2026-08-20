-- Private storage bucket for assistant-generated files (PDF reports, Excel
-- exports). Unlike bank-statements, nothing ever uploads here except the API
-- itself via the service-role client, and downloads happen through short-lived
-- signed URLs it mints — so no authenticated INSERT/SELECT policy is needed at
-- all; the service role bypasses RLS by design. Keeping this bucket free of
-- client-facing policies means a stray anon/authenticated request can't write
-- or list objects here, unlike bank-statements which deliberately allows that.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-exports',
  'agent-exports',
  false,
  26214400, -- 25MB
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload config';
