# Epic 11 — Luma-inspired event experience

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md).

## Outcome

Make discovery, My Events, and event detail feel coherent with the references while showing accurate content and real actions.

## Stories

### US-11.1 — Browse artwork-led event rows

**As a visitor**, I want to compare events quickly on a phone or desktop.

**Acceptance criteria**

- Show square artwork beside the title, the first host’s name when a host exists, an explicitly labeled UTC schedule, one place line, and registration availability. The place line is `venueName` when set, otherwise `location`. Omit host email, address, and map URL.
- Use the designed date-panel fallback when artwork is missing. Cover alternative text is the event title. When the image is unavailable, show the fallback rather than a broken image.
- Apply the dark system with clear hierarchy, restrained separators, and readable long titles. Avoid generic grids of oversized identical cards.
- Preserve published-only discovery, exclusion of cancelled events from available-event lists, and URL-based 20-row pagination.
- Provide honest empty and error states with real next actions. Do not invent hosts, attendance counts, or artwork.

### US-11.2 — See personal event status and actions

**As a participant**, I want My Events to show the next action for each registration.

**Acceptance criteria**

- Use the same row vocabulary, including the first host and the same place line, with specific REGISTERED, CONFIRMED, ATTENDED, NO_SHOW, and CANCELLED labels translated into clear display text.
- Show awaiting confirmation, valid ticket access, cancellation, and eligible certificate actions according to existing rules.
- Preserve cancellation notices, last-updated information, pagination, and safe owner-only data access.

### US-11.3 — Read a complete event page

**As a visitor or participant**, I want the event’s purpose, people, place, and registration action in a clear sequence.

**Acceptance criteria**

- Lead the main column with square artwork or the date fallback, then the event title and UTC schedule.
- Below 1024px, place the primary action under the schedule, then hosts, venue, and description, then repeat that same action. The two controls submit or link to the same destination. They are one decision shown twice, not two choices.
- At 1024px and above, keep a 320px registration column top-aligned with the artwork. It contains the existing availability explanation and the single primary action. The main column does not repeat the action.
- The bottom mobile action sits above the dock, using the dock and safe-area padding from Epic 08.
- Render hosts in `displayOrder`. Show an optional avatar, biography, and public email as a `mailto:` link. Avatar alternative text is empty because the host name is beside the image. Omit absent fields. Do not show an empty host section.
- Show `venueName`, then `venueAddress`, then a separate “Map” link when `mapUrl` is a validated HTTPS URL. The link uses `target="_blank"` and `rel="noopener noreferrer"`. When venue fields are empty, show `location`. Omit empty lines.
- Preserve public details, safe login return, reserved capacity, confirmation gating, full and closed states, and cancelled-event direct-link access.
- The primary action remains the one already required by registration state: sign in to apply, apply, view ticket, or a readable explanation when no action is available.

## Verification

Review image and no-image events, absent hosts and venue, long descriptions and names, every registration state, direct cancelled links, and 320, 360, 768, and 1440px. Confirm the mobile action appears twice and the desktop action appears once, top-aligned. Verify real links, no private contact leakage, no host email on list rows, pagination, and registration behavior.

## Dependencies and scope

Depends on Epics 08–10. Supersedes Epic 02’s presentation and content exclusions only. Existing event privacy and registration rules remain in force. Ticket layout is owned by Epic 12. The admin event index is owned by Epic 13 and does not use these rows.
