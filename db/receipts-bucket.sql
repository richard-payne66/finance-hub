-- Create the receipts storage bucket (private — tax documents).
-- Run once in the Supabase SQL Editor.
-- Signed URLs are generated server-side at display time; no public access needed.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  20971520,  -- 20 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- The service role key bypasses RLS, so no extra storage policies are needed
-- for server-side uploads/reads. If you ever add browser-direct uploads, add
-- a policy here granting INSERT to authenticated.
