# Dark Luma-inspired redesign roadmap

**Status: Planned.** This roadmap records the accepted scope; it does not claim that the application, database, or Supabase setup has been changed.

Read this alongside the [accepted decisions](decisions.md). Later decisions override conflicting earlier requirements. This roadmap supersedes Epic 02’s light palette and exclusions of cover uploads, host profiles, and venue map links. Existing registration, authorization, check-in, and certificate rules remain authoritative.

## Reference assessment

The six references are `IMG_6396.PNG` through `IMG_6401.PNG` in the user’s Downloads folder. They are visual references, not application assets; do not copy personal screenshots or their attendee information into the repository.

| Reference | Useful pattern | Application gap or boundary |
| --- | --- | --- |
| IMG_6396.PNG | Dark discovery rows with artwork, host, schedule, location, and status; rounded mobile navigation | Event artwork and hosts are missing. Navigation must use real, authorized routes. |
| IMG_6397.PNG | Square event artwork, strong title, clear schedule and ticket action | Add real artwork and hosts; preserve confirmation before ticket access. |
| IMG_6398.PNG | Centered ticket, large white QR plate, attendee name and email | Replace the split-card ticket layout. Offer the existing QR download instead of a Wallet integration. |
| IMG_6399.PNG | Venue address, map context, host portraits and biographies | Add optional venue and host data. Use an external map link; omit public guest lists and weather. |
| IMG_6400.PNG | Readable description with restrained section dividers | Improve text measure, spacing, hierarchy, and long-content handling. |
| IMG_6401.PNG | Consistent dark surfaces and navigation | Apply the visual language; notification functionality is outside scope. |

The existing application already has event discovery, native administration, registration, confirmation, private QR tickets, arrival recording, and certificates. Its current content cannot support the references fully: cover images, structured venues, ordered hosts, public host contacts, and avatars need explicit data and upload workflows. Existing events must stay useful without those additions.

## Accepted design direction

Use dark mode by default across public, participant, authentication, and administrator routes. Start with near-black `#101112`, charcoal `#202223`, off-white text, muted gray, subtle borders, mint success indicators, and light primary controls with dark labels. Finalize tokens only when they meet WCAG 2.2 AA, as specified in Epic 08. Use self-hosted TikTok Sans headings and retain Geist body text, with system fallbacks.

Use 16px mobile gutters, roughly 12px control radii and 16px panel radii, compact headings, and restrained CSS feedback. Preserve the eevents brand, plain CSS, server components, native forms and links, and existing routes. Follow the design-taste and anti-slop guidance: purposeful composition, readable copy, real content, and no invented hosts, artwork, contact details, or attendance claims. No custom client JavaScript or new UI framework is introduced.

Discovery and My Events use artwork-led rows with title, the first host when one exists, an explicitly labeled UTC schedule, venue name or location, and status. Event detail leads with square artwork and places the registration action with the summary. Below 1024px that same action is repeated after the description. From 1024px upward it lives once in a top-aligned registration column. Missing artwork uses a deliberate date-panel fallback. Below 768px, a rounded dock contains only actual authorized destinations. Login and signup have no dock.

The ticket is a centered charcoal surface with a compact return control, event title and status, a large black-on-white QR plate, attendee name and email, then UTC schedule and one place line. Save QR and View event are real links. Check-in availability and recorded arrival are separate from attendance status.

## Epic index and execution order

Implement in this order. Each epic owns its detailed acceptance criteria and verification.

1. [Epic 08 — Dark design system](us/epic-08-dark-design-system.md): shared tokens, typography, navigation, and DESIGN.md revision.
2. [Epic 09 — Event content and hosts](us/epic-09-event-content-and-hosts.md): additive schema and native admin metadata management.
3. [Epic 10 — Supabase images and temporary processing](us/epic-10-supabase-images-and-temp-processing.md): authorized upload, validation, private storage, replacement, and cleanup.
4. [Epic 11 — Luma-inspired event experience](us/epic-11-luma-event-experience.md): discovery, My Events, detail, and real content states.
5. [Epic 12 — QR-first ticket page](us/epic-12-qr-first-ticket-page.md): protected ticket hierarchy and eligibility states.
6. [Epic 13 — Dark admin and authentication](us/epic-13-dark-admin-and-authentication.md): remaining workflows and responsive administrative records.
7. [Epic 14 — Redesign verification](us/epic-14-redesign-verification.md): regression, accessibility, upload security, and hosted verification.

## Boundaries and completion

Only ADMIN users create or edit events. REGISTERED reserves capacity; administrator confirmation unlocks the ticket. Preserve the existing signed ticket protocol and owner/admin access. Arrival does not confer ATTENDED or certificate eligibility. Event cancellation is final and retains records. Times remain explicitly UTC and event lists retain 20-row pagination.

Exclude chat, notifications, weather, public guest lists, Wallet integration, in-app scanning, paid tickets, and social calendars. The temporary folder is request-scoped image processing space; Supabase Storage is persistent storage. Keep the image bucket separate from private certificates and all storage credentials server-only.

The redesign is complete only after all seven epics satisfy their criteria, required checks pass, and the hosted participant/admin and Supabase storage flows are manually verified. Platform setup and publication remain separate execution steps; writing these documents does not perform them.
