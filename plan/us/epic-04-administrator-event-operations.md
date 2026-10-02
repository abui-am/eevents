# Epic 04 — Administrator event and participant operations

## Outcome

Give administrators a protected workspace to manage events and participant status, using clear navigation and guest-list patterns inspired by Luma.

Luma documents guest status tabs with counts, searching, sorting, and approval/check-in actions. Adopt status navigation, useful counts, and the protected name/email search and QR review workflow defined in Epic 07. Bulk actions and invitations remain deferred. [Luma guest-list behavior](https://help.luma.com/p/managing-your-guest-list).

## Stories

### US-04.1 — Open the admin dashboard

**As an administrator**, I want an overview of events so I can reach event operations quickly.

**Acceptance criteria**

- Require administrator authorization server-side; anonymous users go to login and participants are denied.
- Show event title, lifecycle state, schedule, registration count, capacity, and a clear route to manage each event.
- Provide event creation and pagination at 20 records per page.

### US-04.2 — Create and edit events

**As an administrator**, I want to create and update event details so participants have accurate information.

**Acceptance criteria**

- Only administrators can create or edit events; participants cannot create their own events.
- Validate title, description, UTC start/end, location, capacity, and lifecycle input on the server.
- Require `endsAt > startsAt` and positive capacity. Reject capacity reductions below the count of non-cancelled registrations with a clear explanation.
- Keep drafts hidden from participants. Published events appear in discovery. Cancellation is final and preserves registration/certificate records.
- Do not allow return to draft after any registration exists. Lock schedule edits once the event starts; permit other valid descriptive edits and surface their updated time.
- Apply capacity changes safely alongside concurrent registration and administrator reopening.

### US-04.3 — Review participants by status

**As an administrator**, I want to review participants and filter by lifecycle status so I can focus on registrations needing action.

**Acceptance criteria**

- Show event participants with name, email, registration time, status, arrival time/state, and certificate state only in the protected admin view.
- Provide status tabs/counts based on the app’s accepted statuses and paginate at 20 rows per page using URL state.
- Add checked-in/not-checked-in filter links and protected event-scoped name/email search for manual check-in, as defined in Epic 07.
- Show eligible actions in a clear row/detail layout; no bulk editing or public guest-list exposure.
- On narrow screens, present participant details without requiring page-level horizontal scrolling.

### US-04.4 — Change registration status

**As an administrator**, I want to update registration and attendance status so the event record remains accurate.

**Acceptance criteria**

- Enforce `REGISTERED → CONFIRMED → ATTENDED | NO_SHOW`; cancellation is allowed from registered or confirmed states.
- `REGISTERED` applications reserve capacity while awaiting approval. Transitioning to `CONFIRMED` issues a ticket; confirming twice does not rotate a still-active ticket. Arrival never automatically changes registration status.
- Store cancellation origin as participant or administrator. Administrator cancellation can only be reopened by an administrator.
- Reopening checks published state, event has not started, and capacity is available; it returns the row to `REGISTERED` and clears cancellation origin.
- Registration cancellation revokes the ticket and clears arrival fields. Reopening requires a new confirmation before a ticket is issued. Event cancellation blocks check-in while retaining registration, arrival, and certificate records.
- Allow `ATTENDED` at or after event start; allow `NO_SHOW` only after event end. Support retrospective entry while enforcing transition rules.
- Do not allow invalid transitions such as `REGISTERED → ATTENDED` or `CANCELLED → CONFIRMED`.

## Dependencies

US-04.1 and US-04.2 depend on Epic 01 admin identity/data and Epic 02 visual patterns. Participant review depends on Epic 03 registrations. Status actions gate Epic 05 certificate upload and Epic 07 ticket issuance; the manual check-in interface is specified in Epic 07.
