# Epic 03 — Participant registration and personal events

## Outcome

Let authenticated participants apply and reserve capacity, receive a ticket after administrator confirmation, cancel or reapply when eligible, and track their registrations from one personal page.

## Stories

### US-03.1 — Apply and reserve capacity

**As a participant**, I want to apply for a published event so an administrator can confirm my place and issue my check-in ticket.

**Acceptance criteria**

- Require authentication; an anonymous visitor is returned to the requested event after login.
- Allow initial registration only before the event starts and while it is published and capacity is available.
- Create a `REGISTERED` row and reserve capacity immediately. Display “Awaiting confirmation”; administrator confirmation is required before a check-in ticket is available. Public event details remain accessible.
- Reject duplicate active registration.
- Run capacity-sensitive registration in a Serializable transaction with the unique `(userId,eventId)` constraint. Concurrent registrations for the last seat yield exactly one success.
- Show a clear application-received, full, or already-applied message without exposing database errors.

### US-03.2 — Cancel and re-register

**As a participant**, I want to cancel a reservation and rejoin when I change my plans.

**Acceptance criteria**

- Permit participant cancellation from `REGISTERED` or `CONFIRMED` before event start; record cancellation origin and release the reserved capacity.
- Re-registration before event start is allowed only after participant-originated cancellation, only for a published event, and only if capacity remains.
- Reuse the existing registration row for re-registration and clear cancellation origin when it returns to `REGISTERED`.
- Cancellation revokes the ticket and clears arrival fields. Reapplication and administrator reopening leave ticket and arrival fields empty; a fresh ticket is issued only after another confirmation.
- After administrator-originated cancellation, only an administrator can reopen the registration; reopening repeats event-time and capacity checks.
- Display confirmation and resulting status clearly. Never enable unavailable actions only by hiding a button; enforce all rules server-side.

### US-03.3 — View my events

**As a participant**, I want to see my registrations and certificate availability in one place.

**Acceptance criteria**

- Require a signed-in participant; show only that participant’s registrations, event details, UTC schedule, current status, and eligible actions.
- Show event-cancellation notices and event last-updated time.
- After administrator confirmation, show “View ticket” and the QR-ticket presentation defined in Epic 07. Pending applicants see an explanation; expired or revoked tickets are not offered as usable tickets.
- Offer certificate download only when issued for an `ATTENDED` registration.
- Paginate long lists and provide useful empty and error states.

## Dependencies

US-03.1 depends on Epic 01 identity/data and Epic 02 event discovery. US-03.2 extends the capacity and registration rules from US-03.1. US-03.3 builds on both registration stories.

## Domain rules

`REGISTERED` and `CONFIRMED` consume capacity; `CANCELLED` does not. `REGISTERED` means the application reserves capacity while awaiting administrator confirmation. `CONFIRMED` enables the ticket. Arrival is recorded separately and never automatically grants attendance or certificate eligibility. Registration and re-registration close at event start. User identity always comes from the authenticated session.
