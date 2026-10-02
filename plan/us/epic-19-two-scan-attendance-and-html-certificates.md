# Epic 19 — Two-scan attendance and lasting HTML certificates

Status: implemented locally; verification results below. Hosted deployment and physical-camera verification are separate.

## Outcome

An administrator’s arrival scan confirms the participant and records `ATTENDED`. A second scan after the scheduled event end verifies that they stayed onsite and issues a printable HTML certificate at a public, unguessable, non-expiring URL. The second scan has no deadline after the end. `ATTENDED` implies confirmation; it is the single current registration status.

## Stories and acceptance

### US-19.1 — Receive an onsite ticket with an application

- Successful registration issues a signed, event-bound QR for `REGISTERED` participants. Existing capacity reservation and questionnaire validation stay atomic.
- Optional administrator approval preserves the current QR. Participant reapplication and administrator reopening issue fresh versions; cancellation revokes the previous QR.
- Migration backfills missing versions for active registrations without changing existing valid versions or inferring attendance.
- Owner/admin authorization protects tickets and QR images. Ticket availability continues after event end without a deadline.

### US-19.2 — Record attendance automatically on arrival

- An authorized administrator can record arrival at any time before or after the event. Eligible states are REGISTERED, CONFIRMED and ATTENDED.
- A scan sets ATTENDED and saves the first arrival timestamp/administrator. Duplicate scans retain original arrival details. No certificate is issued during this phase.
- In-app decoding invokes an authenticated server action immediately. Built-in-camera links open a protected page whose client bridge submits the same POST action. GET and prefetch remain read-only; no-JavaScript mode provides an explicit form.
- Verify stored ADMIN role, signed ticket version, event identity, published lifecycle and server time inside the operation. Cancelled/no-show registrations, invalid/revoked tickets and cancelled events are rejected.
- Manual arrival uses the same rules. Attendance is terminal; the prior arrival-only undo action is removed from the UI and old calls reject.

### US-19.3 — Verify continued onsite presence

- From `endsAt` inclusive, with no upper time limit, the same QR invokes final verification.
- Require a recorded arrival from an earlier scan. A first late scan records arrival; manually marked attendance without arrival does not bypass this first scan.
- Preserve legacy confirmed arrival records; final verification promotes their status to ATTENDED.
- Save final presence time/administrator and certificate together in a serializable transaction. No partial issuance on failure. Retries return one original certificate, URL and verification timestamp.
- Manual arrival cannot issue certificates. There is no scheduled issuance, presence inferred from lack of departure, or administrative bulk issuance bypass.

### US-19.4 — Open a lasting certificate

- Store the full escaped HTML document, random 256-bit URL token, unique registration reference, template version and issue time in Postgres. The document freezes personalized values at issuance.
- `/certificates/[token]` is public to anyone with the link, read-only, non-expiring and independent of ticket signing secrets or Supabase storage URL expiration.
- Show participant name, event title, event schedule in labeled UTC, organizer, certificate ID and issue date. Include no email or questionnaire answers.
- Inline CSS and system fonts support narrow screens and A4 landscape browser printing. No scripts or external assets; unknown tokens return 404.
- Apply no-store, no-referrer, noindex and restrictive CSP headers. Enable RLS and remove Supabase API-role privileges; the trusted application handles token lookup.
- My Events/admin views show View certificate. Existing PDF downloads remain authorized and private; new PDF uploads/replacements and their completion callback are retired. Redeploy the retired Edge Function on existing hosted installations.
- Issued HTML remains available following event cancellation, profile changes and application restarts. Persistence requires retaining the database and application domain.

## Verification

- Database tests cover pending arrival, exact scan boundaries, missing/late arrival, legacy compatibility, administrator authorization, concurrent scans, preserved timestamps, fresh tickets, cancellation races and transactional issuance rollback.
- Public-route tests cover no-login access, unknown tokens, escaping, print styles, frozen contents, cancellation and database reconnect persistence. Existing owner/admin PDF download tests remain.
- DOM tests cover automatic submission once under React Strict Mode, pending/error announcements, explicit retry and safe unmount, along with camera duplicate prevention/cleanup.
- Run typecheck, lint, full database suite and production build. Manually inspect certificate at mobile/desktop sizes and print output. Hosted HTTPS camera verification requires actual devices and deployment.

## Verification results — 3 October 2026

- Full suite: `pnpm test` passes, 162 tests across 28 files. Seventeen additional cases cover the two-scan service/public route, automatic scan bridge and final-window ticket access; existing tests now assert the accepted workflow.
- `pnpm typecheck` passes. `pnpm lint` has no errors and only four existing admin image warnings. `git diff --check` passes.
- Production compilation, lint/type validation, page generation and traces pass in a temporary project copy using the installed dependencies and the same environment. This preserves the active development server cache.
- Migration applied to guarded local development and isolated local test databases; no hosted database was changed. RLS metadata verified for Certificate.
- Chrome desktop visual inspection and single-page landscape print preview confirmed using a synthetic, self-contained certificate. Mobile inspection was interrupted by the native ScreenCaptureKit capture failure/concurrent browser activity and is not claimed complete.
- Physical camera/HTTPS verification and hosted rollout remain pending. Existing installations need the application/database upgrade and deployment of the retired certificate-upload function; legacy PDF objects and downloads remain intact.
- Temporary failed test-schema exploration was cleaned up; no existing participant/event records were deleted. Synthetic HTML preview is available at `/tmp/eevents-certificate-preview.html`.
