-- Private event-media bucket. Run once in the Supabase SQL Editor.
-- Run this after the project exists and separately from Prisma migrations.
-- Do not edit or replace supabase/setup-storage.sql. Certificates stay in
-- their own private bucket.
--
-- Objects are WebP only. The file size limit is 1 MiB (1048576 bytes), matching
-- the processed output cap. The application also rejects extracted uploads over
-- 2 MiB and normalizes them before upload.
--
-- No browser policies are created. Trusted server code uses SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY. Do not put that key in a NEXT_PUBLIC variable or
-- in client code. Missing configuration should fail in the server action with
-- a fixed message and must not log the key.
--
-- Deployment checks before release, all on the Node.js runtime (not Edge):
-- Sharp loads, os.tmpdir() is writable, the process has enough memory to decode
-- an image up to 16 megapixels, and the proxy accepts at least a 3 MB body
-- (experimental.serverActions.bodySizeLimit is 3mb).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  false,
  1048576,
  ARRAY['image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
