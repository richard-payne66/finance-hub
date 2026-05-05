-- Run in Supabase SQL Editor

-- 1. Add checklist_item_id to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checklist_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_checklist_item_id ON documents(checklist_item_id);

-- 2. Create private documents storage bucket (50 MB per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: service role only (all access via signed URLs in API routes)
CREATE POLICY "Service role full access on documents bucket"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');
