# Epic 05 — Private participation certificates

> Workflow update: [Epic 19](epic-19-two-scan-attendance-and-html-certificates.md) supersedes approval-gated tickets, review-before-arrival, separate attendance, undo and new PDF uploads. The original specification below remains historical; existing PDF download compatibility is retained.


## Outcome

Let administrators issue or replace certificates for attendees, and let only the participant or an administrator access each issued file.

## Stories

### US-05.1 — Upload and replace a certificate

**As an administrator**, I want to issue or replace a certificate for an attendee so the participant has the current document.

**Acceptance criteria**

- Require administrator authorization and a registration in `ATTENDED` status.
- A check-in timestamp alone is insufficient: arrival from Epic 07 does not automatically record attendance or enable upload.
- Accept only files no larger than 5 MB whose bytes begin with `%PDF-`; reject a renamed non-PDF.
- Derive the object key server-side as `<registrationId>.pdf`; store it in private Supabase Storage.
- Re-upload replaces the current file. Retain only the latest version; certificate history is out of scope.
- An invalid file or storage failure does not report success or alter certificate metadata. Show a clear upload result in the admin participant view.

### US-05.2 — Download an authorized certificate

**As a participant**, I want a private download of my issued certificate so I can provide proof of participation.

**Acceptance criteria**

- Allow the owning participant and administrators; other authenticated users receive 404, and anonymous users are redirected to login.
- Return 404 if no certificate exists; create a signed URL only after authorization.
- Signed URLs expire after 60 seconds. Keep the certificate bucket private and the route read-only.
- Participant UI offers download only when the registration is `ATTENDED` and a certificate is present.
- An event’s later cancellation does not delete an existing registration or certificate.

## Dependencies

US-05.1 depends on Epic 01 storage setup and Epic 04 attendance status. US-05.2 depends on upload metadata, session auth, and the private bucket.
