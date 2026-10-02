# Redesign verification

Local evidence for Epics 08–14. This file does not claim a hosted pass.

Recorded on 2 October 2026 against the working tree. No screenshots are stored here.

## Commands

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed (`tsc --noEmit`) |
| `pnpm lint` | Passed with 4 warnings |
| `pnpm test` | Passed: 20 files, 97 tests, database `eevents_test` on `localhost:55433` |
| `pnpm build` | Passed: Prisma client generated, Next.js 15.5.27 production build completed |

`pnpm test` reported no pending migrations. Vitest mocks event-media storage. It does not call Supabase.

The lint warnings are `@next/next/no-img-element` on the admin cover, avatar, and participant-page images. Those tags are plain `img` elements on purpose. The image routes must not go through the Next.js image optimizer.

## What was exercised locally

- Discovery HTML for `/` includes the mobile dock, a date-panel fallback when no cover is stored, a UTC schedule, one place line, and availability. The sample event has no host, so no host line is rendered.
- `/login` renders the dark color scheme (`theme-color` `#101112`) and does not include `site-dock`.
- `/events/sample-learning-workshop` renders artwork or date fallback, title, UTC schedule, then three registration slots in the document: under the schedule, after the description, and in the side column. CSS shows the first and last below 1024px, and only the side column from 1024px up.
- Route handlers exist for `/events/[slug]/cover` and `/events/[slug]/hosts/[hostId]/avatar`.
- Admin routes exist for host create and edit, and for cover and avatar removal confirmation.
- Ticket page tests cover eligibility copy, the single place line, and the protected QR endpoint. The QR generator is still a 320px SVG with a 4-module margin.

## Not verified

- Viewports 320, 360, 768, and 1440 were not measured in a browser. No keyboard, 200% text, reduced-motion, or focus-under-dock pass was done on a device.
- Contrast ratios were calculated from the token pairs during Epic 08. They were not remeasured with a browser contrast tool in this pass.
- The ticket QR was not scanned with a phone camera.
- `supabase/setup-event-media.sql` was not applied to a hosted Supabase project. Sharp, the 3 MB server-action body limit, and the upload, replace, and confirm-remove flow were not run on the deployment.
- The hosted participant path (apply, confirm, QR check-in, attendance, private certificate) was not repeated after this redesign.
- `scripts/reconcile-event-media.ts` was not run against a live bucket.

The redesign is not complete until those hosted checks have been run.

## Local time and interface update — 3 October 2026

Implemented Epic 18 using UI/UX Pro Max guidance and the existing dark design tokens. Displayed schedules, registration times, arrivals, and ticket times detect the browser's timezone; initial server output remains UTC. Event creation/editing uses local civil times, an explicit UTC option, and server conversion/validation. Unchanged edit instants retain precision; DST gaps and repeated times require correction or explicit UTC entry.

Creation form is centered. Start/end fields now use react-datepicker 9.1.0 with date-fns-tz, a dark calendar, named time inputs, keyboard interaction, and canonical hidden FormData values. Invalid typed dates remain visible and receive focused validation errors. Semantic badges use colored text, borders, and fills; buttons preserve complete labels; homepage rows use one full native link.

Validation: 25 test files / 133 tests passed; TypeScript and production build passed. Lint has no errors, with existing image warnings and a concurrent questionnaire-test unused-variable warning. Headless Chromium in Asia/Makassar verified first-click sign-in, row navigation, local schedules and UTC switching, badge colors, button sizing, no overflow at 320/360/768/1024/1440px, 200% text sizing, centered creation, calendar selection, and time entry. Browser screenshots stayed in /tmp because they contain private administrator data. No hosted deployment or phone QR verification was performed. Local preview remains available at localhost:3000.

## Sortable questionnaire editor — 3 October 2026

Replaced up/down buttons with a dedicated six-dot drag grip using dnd-kit pointer and keyboard sensors. A position selector provides a single-pointer alternative without dragging. Moving uses React Hook Form's field-array move operation, preserving question IDs, edited wording, required flags, and options. Pending and locked editors disable sorting. Cards use a centered 880px composer, top-aligned question/type fields, compact header tools, a required toggle in the footer, and stacked fields on small screens. Reduced-motion preferences disable sorting transitions.

Verification: 25 files / 139 tests passed, including saved reorder data and locked controls. Browser checks verified keyboard Space/Arrow/Space reordering, pointer dragging, position selection, preserved input values, and no overflow/clipped buttons at 320/375/768/1440px. Test browser edits were not saved to the event. Typecheck and production build passed. Lint passed with four existing image warnings. Screenshots are in /tmp.

### Header simplification follow-up

Per user direction, placed the drag grip immediately to the left of the question number and removed the position dropdown. Updated instructions to describe drag and keyboard sorting. Browser checks confirmed handle placement, absent position selectors, preserved values during pointer/keyboard sorting, and responsive widths 320–1440px. Typecheck passed; 26 test files / 145 tests passed. Updated the shared navigation mock for the concurrently added QR scanner's router use. Local dev cache was refreshed and localhost:3000 restored.

### Image storage setup repair — 3 October 2026

A live read-only storage probe confirmed configured service-role credentials worked, but `event-media` returned 404 / Bucket not found. Created only the missing event-media bucket using the existing setup-event-media.sql specification: private, WebP only, 1,048,576-byte limit. Verified a generated temporary WebP upload and exact-byte private download, then removed that test object. No event cover/avatar references or existing images were changed. The certificates bucket was also absent in the probe and was not changed by this image-storage repair.

### Covers in administrator event lists

The admin query now selects slug and coverKey, and cards render the same EventArtwork component already used by public/My Events lists. Uploaded covers load through the existing authorization-aware cover route; absent covers use local date tiles. Thumbnails link to event operations. Browser verification loaded the existing private draft cover successfully and found no overflow at 320/375/768/1440px. Typecheck passed. Full-suite rerun passed 130 tests but failed 15 check-in/ticket/scanner assertions amid concurrent lifecycle changes; the admin thumbnail markup assertions passed before the combined operational test reached its unrelated manual-check-in assertion. These lifecycle changes were preserved.

### Prisma runtime refresh

The failing registration.findMany selected the new certificate relation and endPresenceAt, but the running dev server retained an older Prisma Client without those fields. All five local migrations were already applied and the generated schema on disk included both. Regenerated Prisma 6.19.3, restarted only this project's dev process, and refreshed its build cache. Authenticated browser requests to the affected admin event and /my both returned 200 with successful registration queries. Documented generation plus server restart after schema changes. No database records were changed.

### QR camera reading refinement

Reproduced a QR visibly present near the left side of a 960×720 camera frame that the old default center-only scanner did not read. The default scan region covered only a central square and downsampled to 400px, without a visible guide. Updated to scan the full frame with preserved aspect ratio and a maximum 960px edge, at 10 scans/second. Preview uses contain rather than cover; added a full-preview guide, camera switch, delayed no-read advice, explicit decoder/permission/device/busy-camera errors, and cancellation during camera startup. Ticket checks remain server-authorized and do not navigate to decoded URLs directly.

The same simulated camera fixture now decoded the off-center QR and reached server validation. The fixture deliberately used an invalid ticket, so the server rejected it and no live attendance record changed. Added tests for full-frame geometry, decoder errors, camera switching, and startup cancellation. 28 files / 164 tests passed; production build, typecheck and lint passed (existing image warnings). Physical camera focus/glare still depends on the user's device and was not tested remotely.

### Arrival and certificate timing restrictions removed

Updated the request to also allow arrival at any time. Removed the opening/closing time gate from server QR and manual arrival paths, admin manual controls, ticket presentation, and ticket links. A first scan always records arrival, including days before or after the event. A later QR scan at or after the scheduled end issues the certificate without a closing deadline. No pre-end arrival requirement remains. Manual actions record arrival but cannot issue certificates; current signed tickets, eligible registrations, published event lifecycle, ADMIN authorization, first timestamps, and immutable/idempotent certificates remain enforced. Updated UI and accepted decisions accordingly; no database migration was needed.

Validation: 28 files / 164 tests passed, including seven-day-early arrival, seven-day-late first arrival, separate final issuance, late manual arrival, and 30-day certificate retries. Typecheck, lint, and production build passed (existing image warnings only).
