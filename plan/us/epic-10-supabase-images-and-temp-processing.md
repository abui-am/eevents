# Epic 10 — Supabase images and temporary processing

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md).

## Outcome

Let administrators upload event covers and host avatars through native forms, using temporary files for bounded processing and private Supabase Storage for persistence.

## Stories

### US-10.1 — Provision separate private image storage

**As an operator**, I want reproducible image storage setup that preserves certificate privacy.

**Acceptance criteria**

- Version a separate Supabase platform SQL setup for a private `event-media` bucket. Do not replace or repurpose the certificates bucket.
- Restrict stored objects to WebP. Set the bucket file size limit to 1 MiB, matching the processed output cap. Enforce input limits in the application as well.
- Keep the Supabase service-role key and storage client server-only. No browser storage credentials or client upload policies are introduced.
- Document required environment variables, setup order, and deployment runtime checks separately from Prisma migrations. Missing configuration produces actionable server feedback without secrets.

### US-10.2 — Validate and process uploads in a temporary folder

**As an administrator**, I want uploaded images normalized safely before they become event content.

**Acceptance criteria**

- Authorize the ADMIN role and the target event or host before processing. Image mutations are server actions. Compare the `Origin` host to `x-forwarded-host` when that header is present, otherwise to `Host`. Reject a missing or different `Origin`. A session cookie alone is not sufficient.
- Set `experimental.serverActions.bodySizeLimit` to `3mb`. Document that the deployment must accept at least a 3 MB request body. Bound the multipart request as well as the extracted file, and reject an extracted file over 2 MiB. Verify the target deployment supports that body size.
- Accept JPEG, PNG, or WebP input of at most 2 MiB. Validate decoded content, not just extension or claimed MIME type. Reject unsupported content, animation, malformed input, and images above 16 megapixels.
- Use a pinned compatible Sharp dependency with explicit decode limits. Correct orientation, strip metadata, and produce centered square WebP: covers at most 1200px, avatars at most 400px. Do not enlarge undersized input unnecessarily.
- Encode WebP at quality 80. If the output exceeds 1 MiB, retry once at quality 60. If it still exceeds 1 MiB, fail the upload and keep the current image.
- Create each request directory with `mkdtemp()` under `os.tmpdir()` using the prefix `eevents-image-`. Use server-generated filenames for input and output. User filenames never determine filesystem paths.
- Bound processed output and clean the directory in `finally` after success or handled failure. Treat temp files as processing artifacts, never persistent application assets.

### US-10.3 — Replace or remove images without corrupting references

**As an administrator**, I want failed or concurrent uploads to leave the current image usable.

**Acceptance criteria**

- Upload processed output with `upsert: false` to a server-generated key: `covers/{eventId}/{uuid}.webp` or `avatars/{eventId}/{hostId}/{uuid}.webp`. Do not put the slug in the key. Update the database reference only after upload succeeds.
- Compare-and-swap on the current object key. The form posts the key it displayed, and an empty value means `null` for a first upload. The server updates the row only when the stored key still equals that value, and it deletes only that previous database value. A losing mutation must not delete the winning image or overwrite its reference.
- After a successful database swap, delete the previous object. If the database write fails, remove the new object and retain the old reference.
- Removal uses a server-rendered confirmation at `/admin/events/[id]/cover/remove` or `/admin/events/[id]/hosts/[hostId]/avatar/remove`. It names the event or host, states that the image will be deleted, and offers a safe return to the edit form. On confirm, clear the authorized reference before deleting its old object. There is no one-click remove.
- Coordinate host deletion with the same ownership and cleanup rules.
- Distinguish invalid input, unavailable storage, database conflict, and cleanup failure. Show persistent inline feedback through native form redirects for upload and replace. Keep usable references intact when the reference was not cleared.
- Record failed object cleanup without secrets and provide an idempotent reconciliation procedure for orphaned objects. Cleanup failure after a committed swap must not revert to a deleted or stale reference.

### US-10.4 — Serve images through authorized application routes

**As a visitor or administrator**, I want images to follow event visibility rules.

**Acceptance criteria**

- Serve covers at `GET /events/[slug]/cover` and avatars at `GET /events/[slug]/hosts/[hostId]/avatar`. Resolve the authorized row, then read that row’s object key. Do not accept an object key from the caller. A renamed event changes the slug and must keep the stored key.
- Download the object with the server-only service role and return the bytes as `image/webp`. Do not redirect to a signed URL. Set `dynamic = "force-dynamic"`.
- Allow public image reads for published and cancelled events. Restrict draft images to administrators. Check authorization on every request. A missing object, or a draft viewed by a non-admin, returns 404.
- Published and cancelled responses use `Cache-Control: private, max-age=60`. Draft and admin responses use `no-store`. Document that a visibility change can leave the previous bytes cached until that 60-second lifetime ends.
- Render images with a plain `img` pointing at these routes. Do not use the Next.js image optimizer.
- Return the correct content type. Event and host views retain their fallbacks when an object is unavailable.
- Cover upload and replace are separate native forms on the event edit page. Avatar upload and replace are separate native forms on the host edit page. Removal goes through the US-10.3 confirmation. No client-side upload SDK or preview JavaScript is required.

### US-10.5 — Recover interrupted processing and cleanup

**As an operator**, I want abandoned temporary files and orphaned objects handled predictably.

**Acceptance criteria**

- Document that `finally` cannot guarantee cleanup after process termination. Provide a documented operator script under `scripts/`. It may delete `eevents-image-` directories older than 15 minutes, and storage objects that are not a current cover or avatar key. It must refuse to delete any key still stored on an event or host.
- Do not add an admin button or a scheduled job for this cleanup in the redesign.
- Verify writable temporary storage, available processing memory, upload body limits, and Sharp support on the deployment runtime before release.
- Document retry and reconciliation for failed remote deletions, distinguishing orphaned objects from all live cover and avatar references.

## Interfaces and data

Keep image storage and processing helpers server-only, with a shared pipeline for cover and avatar size variants. Database columns store object keys from Epic 09. Platform bucket setup is separate from application migrations. Certificate upload and download retain their existing contract.

## Verification

Mock `@/lib/storage` in Vitest. Do not call Supabase from automated tests. Test admin and cross-event authorization, missing and mismatched `Origin` (including `x-forwarded-host`), input and body bounds, spoofed MIME, malformed images, animation, excessive dimensions, orientation, metadata removal, output bounds, the quality-60 retry, and filesystem path safety. Inject storage and database failures. Assert old-image preservation, compare-and-swap conflicts, and request-temp cleanup. Exercise replacement and confirmed removal, draft reads, missing objects, proxied `image/webp` responses, cache headers, failed remote cleanup, and reconciliation that protects live references. Verify the hosted native-form upload, replace, confirm-remove, and read flow against real Supabase.

## Documentation references

- [Supabase bucket creation and restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase object deletion](https://supabase.com/docs/guides/storage/management/delete-objects)
- [Node filesystem APIs](https://nodejs.org/api/fs.html) and [OS temporary directory API](https://nodejs.org/api/os.html)
- [Sharp image processing documentation](https://sharp.pixelplumbing.com/)

Recheck current documentation through Context7 when implementing library or API calls.

## Dependencies and scope

Depends on Epic 09 storage references and existing server-only Supabase configuration. Supplies images to Epics 11 and 13. URL-pasting, public storage buckets, permanent local uploads, certificate changes, and client upload JavaScript are excluded.
