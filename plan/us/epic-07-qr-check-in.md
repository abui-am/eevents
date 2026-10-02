# Epic 07 — QR tickets and administrator check-in

> Workflow update: [Epic 19](epic-19-two-scan-attendance-and-html-certificates.md) supersedes approval-gated tickets, review-before-arrival, separate attendance, undo and new PDF uploads. The original specification below remains historical; existing PDF download compatibility is retained.


## Outcome

Use the flow: participant applies (`REGISTERED`) → administrator confirms (`CONFIRMED`) → ticket appears in My Events → administrator scans and confirms arrival.

This supersedes the earlier no-approval admission behavior. Public event details remain accessible. Use Luma's review-before-confirming check-in interaction as a reference; this app uses the phone's built-in camera to open a server-rendered review page. Arrival is separate from attendance and certificate eligibility. [Luma check-in reference](https://help.luma.com/p/check-in).

## Stories

### US-07.1 — Receive a ticket after confirmation

**As a participant**, I want a ticket after administrator confirmation so I can present it at the event.

**Acceptance criteria**

- Application creates `REGISTERED`, reserves capacity, and displays “Awaiting confirmation.”
- Administrator confirmation creates a fresh ticket version. Only `CONFIRMED` or `ATTENDED` registrations for a published event have a current usable ticket before event end.
- My Events offers “View ticket.” The owner/admin ticket page shows participant name, event, UTC schedule, and a large black-on-white QR with a clear quiet zone.
- The participant may display or save the QR image with native browser tools. State “Show this code to the event administrator”; opening a ticket or QR URL does not check the participant in.
- Tickets may be displayed before the check-in window opens; the page explains the window. After event end or event cancellation, show an unavailable explanation rather than an active QR.
- Delivery stays inside the account; email delivery is deferred.
- Registration cancellation revokes its ticket and clears arrival fields. Reapplication or administrator reopening returns to `REGISTERED` with no ticket; reconfirmation issues a new version. An old saved QR never becomes valid again.

### US-07.2 — Review and confirm arrival

**As an administrator**, I want to scan a participant's QR and review the ticket before recording arrival.

**Acceptance criteria**

- The phone camera opens an event-specific administrator review page. Anonymous users are redirected to login with a safe local return path; participants cannot view or submit administrator check-in.
- A valid reference shows event, participant, registration status, and arrival state. Opening or previewing the link is read-only.
- An explicit server-action submission records arrival, deriving administrator identity from the session.
- Check-in is open when `startsAt - 1 hour <= now < endsAt`, for published events, current ticket versions, and registration status `CONFIRMED` or `ATTENDED`.
- Invalid, tampered, cross-event, or revoked references return 404. A valid but time-closed or event-cancelled ticket shows a clear explanation and cannot mutate arrival.
- Repeat or concurrent scans/submissions record one arrival and display its original timestamp. Existing arrival time and actor are not overwritten by a duplicate.
- Recheck signature/version, event status, registration status, and time inside the mutation; a successful preview does not guarantee a later submission remains eligible.

### US-07.3 — Keep arrival separate from attendance

**As an administrator**, I want arrival recorded separately so a certificate still requires an explicit attendance decision.

**Acceptance criteria**

- Store check-in time and the administering user on the registration.
- Check-in changes no registration status, including during the early-arrival window. It never automatically sets `ATTENDED` or enables certificate upload.
- Preserve the existing timing rules for administrator attendance/no-show updates and the attended-only certificate rule.
- The protected participant list shows arrival state/time and checked-in/not-checked-in filter links with counts.

### US-07.4 — Handle missing codes and mistakes

**As an administrator**, I want manual fallback and correction so arrival can be recorded when a QR cannot be read.

**Acceptance criteria**

- Search by name/email within the selected event's protected participant list. Use a server-rendered GET form with validated query input, case-insensitive matching, 20-row pagination, and counts under the current filters.
- Manual check-in resolves the selected registration's current ticket and uses the same eligibility, window, authorization, and duplicate rules as QR check-in. It cannot check in a pending application.
- Allow explicit administrator undo only during the check-in window while registration status is `CONFIRMED`.
- Undo clears arrival time/actor, retains the active ticket, and changes no registration status. Repeated undo is harmless; another legitimate check-in may record a new arrival.
- Do not allow undo to reverse an `ATTENDED` record or remove certificate eligibility.

## Interfaces and data

- Add nullable `checkInTicketVersion` (UUID), `checkedInAt` (timestamp), and `checkedInById` (foreign key to `User`) to `Registration` through a committed Prisma migration. Store arrival time/actor together. These fields are not a new registration status enum.
- Use a dedicated server-only `CHECKIN_SIGNING_SECRET`. Create an HMAC-SHA256 signature over an unambiguous encoding of event ID, registration ID, and ticket version. Verify the signature using timing-safe comparison; validate lengths and encoding before comparison.
- Issue the version only on confirmation. Repeating confirmation of an already-confirmed active registration preserves its ticket. Cancellation sets the version and arrival fields to null; reapplication/reopening leaves them null until another confirmation. Event cancellation retains records but fails event eligibility.
- Participant presentation page: `GET /my/registrations/[id]/ticket`. Authenticate the owner or an administrator; another authenticated user receives 404.
- Protected QR image: `GET /api/tickets/[id]/qr`. Apply the same ownership and ticket-availability checks and return `image/svg+xml`.
- QR payload: the trusted configured application origin plus `/admin/events/[eventId]/check-in?ticket=<encoded signed reference>`. Include identifiers/version/signature only, never participant name/email or a login credential.
- Render SVG server-side using `qrcode`, with four-module margin, medium error correction, and black-on-white colors. No client-side QR or camera library is needed. [Server-side generation reference](https://github.com/soldair/node-qrcode).
- Ticket/image/review responses are private and non-cacheable and use `Referrer-Policy: no-referrer`. Do not send ticket references to analytics or third-party resources.
- Keep business operations in services behind authorized server-action wrappers. Serialize arrival, cancellation, undo, and ticket-changing writes so stale actions cannot revive cancelled or reissued tickets.

## Verification

- Pending applicants cannot obtain a usable ticket; confirmed owners and administrators can. Cross-user ticket/image requests are 404.
- Anonymous and participant users cannot invoke administrator check-in; knowing a valid QR reference grants no authorization.
- Tampered, malformed, cross-event, old-version, and registration-cancelled references fail without data mutation.
- GET preview/image/presentation requests never record arrival.
- Repeated and concurrent confirmation submissions preserve one arrival and its original actor/time.
- Check the instant before and at the opening boundary, and immediately before and at event end using a controlled clock.
- Early arrival leaves status unchanged and does not grant certificate eligibility.
- Preview followed by cancellation, event cancellation, ticket reissue, or window closing cannot result in an invalid check-in.
- Manual fallback and undo use the same actor/time restrictions; undo does not affect registration or certificate status.
- Registration cancellation revokes a saved code. Reapplication plus reconfirmation produces a fresh working code and an empty arrival state.
- Manually verify the deployed flow with two phones, including admin login return, review/confirm, duplicate feedback, fallback, and revocation. Administrator check-in needs internet access.

## Dependencies and scope

Depends on Epic 01 authentication, protected data, and migrations; Epic 02 design patterns; Epic 03 applications/My Events; and Epic 04 administrator confirmation. Epic 05 continues to require `ATTENDED`; Epic 06 includes these scenarios in CI and deployed verification.

No express mode, participant self-check-in, in-app camera scanner, custom client JavaScript, additional staff role, wallet integration, offline synchronization, or email delivery is included.

## Current implementation status

Participant ticket presentation and server-generated QR images are implemented, and administrator confirmation issues a versioned ticket. The protected administrator scan/review route, serialized check-in mutation, event-scoped manual fallback/search, and in-window undo are implemented locally. The route verifies signed references and redirects anonymous admins through login with a safe local return path; preview remains read-only. Database-backed tests cover authorization, stale and cross-event references, time boundaries, duplicate/concurrent scans, actor identity, cancellation races, manual check-in, and undo. Hosted verification still depends on the Supabase/Vercel deployment setup.
