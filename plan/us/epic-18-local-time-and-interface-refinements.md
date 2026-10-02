# Epic 18 — Local time and interface refinements

**Status: Implemented locally.** Hosted verification remains separate. This refinement follows the user's request to show device-local time, use local schedule entry, color participant badges, keep buttons readable, and make discovery rows fully clickable. Apply UI/UX Pro Max's accessibility, touch-target, stable-layout, and semantic-navigation guidance within [DESIGN.md](../../DESIGN.md).

## Outcome

Show each viewer accurate local dates and times, while keeping stored timestamps and eligibility checks based on UTC instants. Make status and navigation easier to scan and use.

## Stories

### US-18.1 — Automatically localize displayed times

**As a viewer**, I want schedules and timestamps in my device timezone so I do not have to convert them myself.

**Acceptance criteria**

- A shared client provider detects the browser's IANA timezone without requesting location. Server rendering and the initial hydrated render use the same explicitly labeled UTC fallback.
- Discovery, event detail, My Events, tickets, admin index, participant registrations, arrivals, updates, and check-in use shared local-time components. Date tiles use the converted local date.
- Show English dates, 24-hour times, the timezone, and the offset applicable to the timestamp. A range crossing an offset change shows both offsets.
- In Asia/Makassar, 09:00–12:00 UTC displays as 17:00–20:00. Local midnight rollover updates the date too.
- Semantic `time` elements retain the original UTC ISO instant. Storage, capacity, registration cutoff, and check-in eligibility remain server-owned.

### US-18.2 — Enter schedules in local time

**As an administrator**, I want event schedule fields to use my device timezone and save the correct instant.

**Acceptance criteria**

- Create/edit defaults to the detected timezone and offers an explicit UTC option. Show the selected timezone beside the fields.
- Submit local startsAt/endsAt strings plus timeZone; independently validate and convert server-side with Temporal. Existing callers without timeZone use UTC. Invalid supplied zones are rejected.
- Valid timezone switching preserves the represented instant. Incomplete or ambiguous input stays visible with a review notice rather than being silently shifted.
- Field errors explain skipped/repeated daylight-saving times and the UTC alternative. End must follow start after conversion.
- Preserve submitted values and timezone after failure. Do not overwrite a dirty schedule during initial detection. Unchanged edits retain the database's original instants and precision, including repeated-hour times and locked schedules.

### US-18.3 — Make badges and buttons readable

**As a user**, I want statuses distinguishable and action labels complete on every screen size.

**Acceptance criteria**

- Creation form is centered. Start/end use a dark, keyboard-accessible react-datepicker calendar with time entry and canonical civil-time FormData.
- Locally owned shadcn-style Badge/Button primitives use the project's plain CSS and semantic tokens. They keep native HTML semantics and existing form validation/pending behavior.
- Awaiting confirmation is amber; confirmed is blue; attended/published is mint; cancelled/declined is rose; draft/no-show is neutral. Text always names the status.
- Button targets are at least 44px. Short labels stay intact; long labels wrap at words and controls grow vertically. Neither normal nor pending labels are ellipsized or clipped.
- Participant search allocates intrinsic width to its submit control, allows the input to shrink, puts errors below, and stacks on narrow screens.

### US-18.4 — Open events from the whole discovery row

**As a visitor**, I want tapping artwork, information, or row padding to open the event directly.

**Acceptance criteria**

- Each discovery row contains one native Next.js link with an accessible name from the title. All row content belongs to that link, with no nested interactive controls.
- Hover and keyboard focus identify the whole target. Enter, modified clicks, and opening in another tab retain normal link behavior.
- Existing pagination, event eligibility, and destination routes are preserved.

## Interfaces and data

Event FormData adds timeZone. Event validation yields Date instants plus the validated timezone; event writes store only the existing UTC columns. Edit validation obtains authoritative prior instants inside the transaction. Client presentation accepts UTC ISO strings. No database migration or account timezone preference is added.

## Verification

Use isolated local Postgres and DOM tests for Bali conversion, midnight rollover, fractional offsets, DST gaps/repeats, offset-changing ranges, UTC compatibility, round-trip saves, unchanged locked edits, server-rendered UTC fallback, automatic field population, timezone switching, and returned-value preservation. Review full-row navigation, badge styling, button/pending labels, keyboard focus, and overflow at 320, 360, 768, 1024, and 1440px plus 200% text. Run typecheck, lint, tests, and build; record actual results in the handoff.

## Dependencies and scope

Extends Epics 08–16. Supersedes UTC-only display/entry and the former restriction on client JavaScript outside forms. Automatic detection follows the device's configured timezone; it does not infer physical location or request GPS permission. No booking, attendance, or account-role behavior changes are introduced.
