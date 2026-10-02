# Epic 12 — QR-first ticket page

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md), using IMG_6398.PNG as the principal composition reference.

## Outcome

Give confirmed participants a readable, protected ticket centered on a scannable QR code and clear account identity.

## Stories

### US-12.1 — Present a focused ticket

**As a confirmed participant**, I want a ticket I can find and show quickly at the event.

**Acceptance criteria**

- Replace the split-card composition with a centered charcoal surface, compact return control, event title and status, prominent white QR plate, attendee name and email, then UTC schedule and one place line.
- The place line is `venueName` when set, otherwise `location`. Do not show the address or a map link. “View event” opens the full place.
- Keep the existing QR endpoint: SVG width 320, margin 4, black modules on white. Scale it with CSS (`max-width: 100%`) to the panel. Do not crop, overlay, or add padding inside the quiet zone.
- Provide working Save QR and View event links with accessible labels. Preserve the existing protected download endpoint and native navigation.
- Make the QR comfortably usable on a 320px viewport and larger screens without clipping, horizontal overflow, or a fixed-height layout that hides secondary content.
- Use actual event and participant data. Add no Wallet button or fabricated ticket features.

### US-12.2 — Explain eligibility and arrival accurately

**As a participant**, I want the ticket to explain its current usability.

**Acceptance criteria**

- Show no usable QR for pending, revoked, expired, unpublished, or cancelled cases. Give a specific explanation and a valid next destination.
- Distinguish check-in opening time, open or closed window, and recorded arrival. Show UTC timestamps explicitly.
- Preserve the authoritative check-in window `startsAt - 1 hour <= now < endsAt` and current ticket-version checks from Epic 07.
- Arrival remains separate from ATTENDED and certificate eligibility. Display text never implies automatic attendance certification.

### US-12.3 — Preserve ticket privacy and protocol

**As an account holder**, I want my identity and ticket available only to authorized users.

**Acceptance criteria**

- Keep page and QR routes protected for the owner or authorized administrator, including guessed identifiers and login-return behavior.
- Keep personal name and email in protected presentation only. Do not add PII to the signed QR payload.
- Preserve event binding, revocation, cancellation, confirmation, and ticket rotation behavior. No redesign change creates a new admission path.

## Interfaces and data

Use the existing ticket page, CSS module, QR endpoint, and ticket service. Consume Epic 09’s participant email, arrival, event slug, and place line. Keep authorization in the service and route boundary rather than relying on hidden controls.

## Verification

Check owner, admin, and other-user access, every eligibility state, confirmation and revocation transitions, and QR download. Scan the rendered and downloaded QR with a phone camera at representative mobile sizes, including 320px, and confirm the quiet zone and the protected admin review flow. Review long attendee names and email, 200% text, keyboard navigation, and high contrast.

## Dependencies and scope

Depends on Epics 08–09 and the existing [Epic 07 protocol](epic-07-qr-check-in.md). Follows Epic 11 for event destinations. Wallet integration, new scanner behavior, and participant self-check-in are excluded.
