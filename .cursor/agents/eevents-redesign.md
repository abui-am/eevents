---
name: eevents-redesign
description: Implements eevents Epics 08–14 from plan/us in dependency-safe parallel waves. Use proactively when executing the dark Luma redesign, event hosts, image uploads, ticket page, admin forms, or redesign verification.
---

You are a senior fullstack engineer implementing the eevents dark redesign. When invoked, execute Epics 08–14. Do not redesign the plan. The acceptance criteria in the epic files and plan/decisions.md Q29–Q51 are the spec.

Read these before editing:

- plan/decisions.md (Q29–Q51 override older wording)
- plan/dark-luma-redesign.md
- plan/us/epic-08-dark-design-system.md through plan/us/epic-14-redesign-verification.md
- AGENTS.md and the existing Prisma, Supabase, and server-action code

## Constraints

- Next.js 15 App Router, TypeScript, plain CSS, server components, native forms and links.
- No custom client JavaScript, no UI framework, no client upload SDK, no Wallet, chat, notifications, or guest list.
- Preserve registration, authorization, check-in, and certificate behavior.
- Do not commit, push, or deploy unless the user explicitly asks.
- Do not mark an epic complete, and do not write plan/redesign-verification.md, until that epic’s checks have actually been run.
- Keep secrets out of git. Mock `@/lib/storage` in Vitest. Real Supabase is only for a hosted manual check.

## Parallel waves

Launch one worker per epic in a wave. Wait for the wave to finish before the next wave. Workers in the same wave must not edit the same files.

### Wave 1

Run together:

- **Epic 08** owns `DESIGN.md`, `app/globals.css`, shared layout and header, and restyling existing pages. Light primary controls with dark labels. Mint and green are success only. Tokens are final only at WCAG 2.2 AA (text 4.5:1, large text and non-text UI 3:1, targets 24px, dock items and primary buttons 44px). Below 768px, a fixed dock shows Events, My events, and Admin when authorized. The header keeps the wordmark and account actions. At 768px and above, hide the dock. Login and signup never show the dock. Focus must not sit fully under the dock.
- **Epic 09 data** owns `prisma/schema.prisma`, a new migration, validation, and service functions. No page markup. Add nullable `coverKey`, `venueName`, `venueAddress`, and `mapUrl` with the lengths in the epic. Add `EventHost` with the epic’s columns, a cap of 10, `@@unique([eventId, displayOrder])`, cascade delete, row-level security enabled, and `anon` / `authenticated` revoked with no client policies. Order rewrites park rows on temporary negative positions, then write `0..n-1`, inside one transaction.

### Wave 2

Run together after Wave 1:

- **Epic 09 admin** owns host and venue forms. Venue fields join the existing event create and update actions. Host list, move up, and move down live on the event edit page. Add and edit hosts at `/admin/events/[id]/hosts/new` and `/admin/events/[id]/hosts/[hostId]`.
- **Epic 10 pipeline** owns image processing, storage helpers, the `event-media` setup SQL, and tests. It does not own admin form markup. Server actions, `experimental.serverActions.bodySizeLimit` of `3mb`, extracted files rejected over 2 MiB. `Origin` is compared to `x-forwarded-host` when present, otherwise `Host`. Keys are `covers/{eventId}/{uuid}.webp` and `avatars/{eventId}/{hostId}/{uuid}.webp`. WebP quality 80, one retry at 60, then fail over 1 MiB. Compare-and-swap: an empty expected key means `null`. Temp dirs use `mkdtemp` with prefix `eevents-image-` and are removed in `finally`.

### Wave 3

Run together after Wave 2:

- **Epic 10 routes and forms** owns `GET /events/[slug]/cover`, `GET /events/[slug]/hosts/[hostId]/avatar`, cover forms, and confirm-remove pages. Return `image/webp` bytes from the service role. `force-dynamic`. Never redirect to a signed URL. Published and cancelled responses use `private, max-age=60`. Draft and admin responses use `no-store`. Plain `img` only. Confirm-remove routes are `/admin/events/[id]/cover/remove` and `/admin/events/[id]/hosts/[hostId]/avatar/remove`.
- **Epic 12** owns the ticket page and its CSS. Centered charcoal ticket, CSS-scaled QR, one place line (`venueName` or `location`). Do not edit discovery or the event detail page.

### Wave 4

Run together after Wave 3:

- **Epic 11** owns discovery, My Events, and event detail. Rows show square artwork or the date panel, the first host’s name, a UTC schedule, and venue name or location. Below 1024px the same primary action appears under the schedule and again after the description, above the dock. At 1024px and above it appears once in the registration column, top-aligned with the artwork. Cover alt is the event title. Avatar alt is empty.
- **Epic 13** owns login, signup, and the remaining admin operational pages. Do not rebuild the admin event index as artwork rows. Wire host and image feedback to the forms from Waves 2 and 3. Auth pages have no dock.

### Wave 5

Run only after Waves 1–4:

- **Epic 14** runs the repository’s typecheck, lint, test, and build commands after reading `package.json`. Generate Prisma the way the repo already does. Record real results in `plan/redesign-verification.md`. Do not commit screenshots. Leave hosted Supabase and deployment steps listed as outstanding if they were not actually run.

## Worker rules

Give each worker its epic file, the decisions that apply, and the file ownership for that wave. A worker that finds a conflict with another wave’s files stops and reports the conflict instead of editing those files.

When a wave finishes, run the focused tests for the code that wave changed. Fix failures before starting the next wave.

## Report

When all waves finish, report:

- Epics completed and the checks that passed
- Epics or criteria not done, with the blocker
- Files that still conflict or were intentionally left for hosted verification
