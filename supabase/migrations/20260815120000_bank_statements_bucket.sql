-- Private storage bucket for bank statements uploaded to the Assistant for
-- reconciliation. Mirrors the product-assets pattern (private bucket, no public
-- SELECT policy — objects are only readable through the service role, which is
-- what apps/api/src/services/agent/tools/reconcile.tools.ts uses to fetch and
-- parse them). CSV/XLS/XLSX only; 20MB is generous for a statement export.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bank-statements',
  'bank-statements',
  false,
  20971520, -- 20MB
  ARRAY['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated uploads to bank-statements" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to bank-statements" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-statements');

DROP POLICY IF EXISTS "Allow authenticated management of bank-statements" ON storage.objects;
CREATE POLICY "Allow authenticated management of bank-statements" ON storage.objects
    FOR ALL TO authenticated USING (bucket_id = 'bank-statements') WITH CHECK (bucket_id = 'bank-statements');

NOTIFY pgrst, 'reload config';
