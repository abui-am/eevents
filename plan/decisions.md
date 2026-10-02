# Accepted refinement decisions

Source brief: [refinement-brief.md](refinement-brief.md).

The user accepted recommendations Q1–Q20 and subsequently added the QR-ticket/check-in flow below. These decisions refine the brief; later decisions override conflicting earlier behavior. The original `events-app.zip` was not found. The workspace did contain a bare Next.js starter, so Epic 01 is now implemented on that repository as the application foundation; the original event-management draft was not restored.

## Round 1 — accepted

1. Applying for a published event creates a `REGISTERED` registration and reserves capacity immediately. Under the subsequently accepted check-in flow, administrator confirmation is required before the participant receives a check-in ticket. Public event details remain accessible without approval.
2. Participants may cancel their `REGISTERED` or `CONFIRMED` registration before the event starts. Cancellation releases capacity.
3. Administrators may replace an issued certificate. Only the latest file is retained; certificate version history is deferred.
4. Keep the application free of custom client JavaScript. Omit the proposed `useFormStatus` client component. This does not claim that Next.js itself emits no browser JavaScript.
5. Use local Postgres for automated tests and CI. Use deployed Supabase for manual end-to-end verification.
6. Commit database migrations wherever possible. Document any Supabase platform setup that must be applied separately.
7. Retain a public Git repository, deployed URL, and deployed manual verification as deliverables. Supply credentials outside the repository and review the concrete result before publication.

## Round 2 — accepted

8. Use Eventbrite as the broad competitor benchmark. Focus the app on small organizations running workshops or training where attendance certificates matter.
9. Allow re-registration after participant cancellation before the event starts if capacity remains. Reuse the existing registration row with `CANCELLED → REGISTERED`. Administrator cancellation is governed by Q18.
10. Use `CANCELLED` for administrator declines; do not add a `REJECTED` status.
11. Retain the in-memory login throttle as best-effort and document its limitations across Vercel instances.
12. Issue a new session token at login and delete the session represented by the current cookie. Retain other valid sessions for the user.
13. Enter and display event times in UTC, explicitly labeled wherever they appear.
14. Show a clear event cancellation notice and a last-updated timestamp for other edits on the event page and `/my`.
15. Use a precomputed valid bcrypt hash for unknown-user comparisons with the same work factor as account hashes. Describe this as reducing timing differences, not eliminating them.
16. Use Vitest with local Postgres for schema, service, and route authorization tests. Verify the deployed end-to-end flow manually.
17. Put application schema, constraints, and RLS in Prisma migrations. Version private bucket creation separately as a documented Supabase SQL setup script.

## Round 3 — accepted

18. Record whether the participant or administrator cancelled a registration. Participants may re-register after their own cancellation. An administrator decline requires an administrator to reopen the registration. Reopening must check event eligibility and available capacity before restoring `REGISTERED`.
19. Block reverting an event to `DRAFT` once any registration exists. Treat event cancellation as final. Retain registration and certificate records when an event is cancelled.
20. Close initial registration and re-registration at the event start. Allow recording `ATTENDED` from the start and `NO_SHOW` after the end. Lock schedule edits once the event has started. Administrators may record attendance retrospectively, subject to the status transition rules.

## QR tickets and check-in — accepted

21. Use the flow: participant applies (`REGISTERED`) → administrator confirms (`CONFIRMED`) → participant receives a ticket link/QR in My Events. This supersedes the earlier no-approval admission behavior. Only administrators create and edit events.
22. An administrator scans the participant's QR using the phone's built-in camera. The link opens a protected review page; an explicit server-action submission records arrival. No custom client JavaScript, camera scanner, express mode, or participant self-check-in is added.
23. Check-in records arrival separately from registration status and certificate eligibility. Store arrival time and the administering user; checking in never automatically sets `ATTENDED`.
24. Superseded by Q60–61 and the unrestricted-arrival request: arrival has no time window; final certificate verification requires a recorded arrival and a second QR scan after the end, with no closing deadline. Published lifecycle, eligible registration, current signed ticket and ADMIN authorization remain required.
25. Issue signed, event-bound ticket references after confirmation. Registration cancellation revokes the ticket and clears arrival fields. Reapplication or administrator reopening returns to `REGISTERED`; another confirmation issues a fresh version. Event cancellation blocks check-in while retaining existing records.
26. Repeated or concurrent check-in records one arrival and displays its original timestamp. Serialize check-in with cancellation and ticket changes.
27. Provide protected event-scoped name/email search and manual check-in using the same rules. Allow administrator undo during the check-in window only while status remains `CONFIRMED`; undo clears arrival fields, preserves the ticket, and changes no registration status.
28. Ticket delivery is account-only. Administrator check-in requires internet access. Email delivery, wallet integration, additional staff roles, offline synchronization, and in-app scanning are deferred.

See [Epic 07](us/epic-07-qr-check-in.md) for stories, interfaces, and verification.

## Implementation handoff

Apply this decision record together with the original brief. The accepted changes to cancellation and re-registration override the original terminal `CANCELLED` registration behavior. Event cancellation remains terminal. Participants create accounts and apply for published events; administrators confirm applications before tickets are available. Only administrators create and edit events.

Implementation status: Epics 01–05 cover the Prisma schema and migration, RLS, local Postgres setup, admin seed, custom sessions, event discovery and operations, participant registration and QR ticket presentation, and private certificate upload/download flows. Epic 06 adds the isolated local Postgres test runner, database-backed Vitest coverage, CI and daily keep-alive workflows, and a database-only health endpoint. Epic 07 now includes the protected admin scan/review page, serializable arrival recording, event-scoped manual check-in, safe login return, and in-window undo, with database-backed race, authorization, and time-window tests. The private bucket and Edge Function still need deployment to Supabase, and the hosted participant/admin flow remains to be verified.

The original application archive was not available, so implementation began from the one-commit Next.js starter in this repository. Supabase, Vercel, and Git hosting access are needed for the deployment deliverables. Credentials must remain outside version control.

Follow the brief's priorities: establish a working install and build, implement the accepted correctness and authorization changes, add database-backed tests and CI, then deploy and verify the participant/admin flow. Preserve the original definition of done.

## Benchmark evidence and scope

The benchmark assessed the planned product. At inspection time, the workspace contained the saved brief without application source, `events-app.zip`, or a Git repository. Product implementation and build claims remain unverified.

Eventbrite sources reviewed:

- [Event creation](https://www.eventbrite.com/help/en-us/articles/551351/how-to-create-an-event/)
- [Organizer features](https://www.eventbrite.com/organizer/features/all-features/)
- [Attendee application](https://www.eventbrite.com/help/en-us/articles/783059/how-to-use-the-eventbrite-iphone-app/)

The planned app's differentiating workflow is attendance followed by private certificate access. The reviewed Eventbrite sources describe discovery, ticketing, organizer tools, and check-in; absence of a certificate workflow in those sources does not establish that Eventbrite has no such capability.

## Dark Luma-inspired redesign — accepted

29. Use the six user-supplied Downloads references, IMG_6396.PNG through IMG_6401.PNG, to guide a dark redesign. Follow the taste and anti-slop guidance, preserve the eevents brand, and use real content. The [redesign roadmap](dark-luma-redesign.md) records the assessment and execution order.
30. Dark mode is the default across public, participant, authentication, and admin routes. Update DESIGN.md during Epic 08 implementation. This supersedes the light palette in Epic 02; preserve plain CSS, native forms/links, server components, and no custom client JavaScript.
31. Add optional event artwork, structured venue/address/HTTPS map link, and ordered hosts with optional biography, avatar, and explicitly public contact email. Keep existing location and date-panel fallbacks. Never automatically expose account email as host contact. These additions supersede Epic 02’s corresponding exclusions.
32. Administrators upload cover and avatar images through native forms. Persist normalized images in a separate private Supabase `event-media` bucket using server-only credentials; store object keys in the database. Private certificate storage remains separate.
33. Use request-specific `eevents-image-` directories under `os.tmpdir()` for image processing. Accept JPEG/PNG/WebP input up to 2 MiB, reject animation and input above 16 megapixels, and normalize with Sharp to metadata-stripped square WebP covers up to 1200px or avatars up to 400px. Remove request files in `finally` and document interrupted-process recovery.
34. Upload unique objects before swapping references; serialize or compare-and-swap concurrent replacement/removal. Preserve the old image on failure, clean new orphaned objects on database failure, and delete old objects after a successful swap. Document failed cleanup reconciliation. Serve images through same-origin routes with event visibility authorization before storage access.
35. Redesign the protected ticket around IMG_6398.PNG: centered charcoal composition, large black-on-white QR plate, attendee name/email, status, UTC schedule, venue, Save QR, and View event. Keep owner/admin privacy, signed payloads without PII, quiet zones, eligibility rules, and arrival separate from attendance. Wallet integration remains deferred.
36. Preserve ADMIN-only event editing, capacity reservation at REGISTERED, confirmation before tickets, UTC times, 20-row pagination, final event cancellation, and existing check-in/certificate rules. Chat, notifications, weather, public guest lists, in-app scanning, and paid tickets remain outside this redesign.
37. Deliver the roadmap and Epics 08–14 into `plan/` first. Their application work remains planned until implemented and verified. Execute 08 → 09 → 10 → 11 → 12 → 13 → 14, including responsive/accessibility review, meaningful regression and upload-failure tests, required local checks, and hosted manual verification.

## Dark redesign grill — accepted

These choices refine Q29–Q37. Epics 08–14 are the acceptance criteria.

38. Primary controls are light with dark labels. Mint and green are success only. Tokens are final only at WCAG 2.2 AA: text 4.5:1, large text and non-text UI 3:1, ordinary targets 24px. Dock items and primary buttons are 44px. Keyboard focus must not sit fully under the dock.
39. Below 768px, a dock shows Events, My events, and Admin when authorized. The header keeps the wordmark and account actions. At 768px and above, the header nav returns and the dock is hidden. Login and signup have no dock. Labels stay sentence case.
40. Discovery and My Events show the first host’s name only, and `venueName` or else `location`. Address, map, and host email stay off those rows. The admin event index stays a dense text list.
41. Hosts use move up and move down, with a cap of 10. `name` 100, `biography` 500, `publicEmail` 320, `venueName` 160, `venueAddress` 300, `mapUrl` 1000 and HTTPS only. `coverKey` and `avatarKey` are `VarChar(300)`. Every host mutation rewrites `displayOrder` to `0..n-1` in the same transaction.
42. Below 1024px, the event’s primary action appears under the schedule and again after the description. At 1024px and above, it appears once in the registration column, top-aligned with the artwork.
43. Cover alternative text is the event title. Host avatars use empty alt. Detail shows venue name, address, and an HTTPS Map link. The ticket place line is venue name or location only.
44. Image replacement is compare-and-swap on the stored object key. This selects the compare-and-swap branch of Q34. Image mutations require a matching `Origin` host. Routes are `GET /events/[slug]/cover` and `GET /events/[slug]/hosts/[hostId]/avatar`, rendered with a plain `img`. Published and cancelled reads use `private, max-age=60`. Draft reads use `no-store`.
45. Encode WebP at quality 80, retry once at 60 above 1 MiB, then fail and keep the old image. The `event-media` bucket limit is 1 MiB. Removal uses a server-rendered confirmation. Orphan and stale-temp cleanup is an operator script: `eevents-image-` directories older than 15 minutes, and unreferenced objects only.
46. Verification results are written to `plan/redesign-verification.md` during Epic 14. Screenshots are not committed.

## Implementation grill — accepted

These choices refine Q38–Q46 for the current Next.js 15.5 application.

47. Image uploads stay on server actions. Set `experimental.serverActions.bodySizeLimit` to `3mb`, require the deployment to accept at least a 3 MB body, and reject an extracted file over 2 MiB.
48. Image routes download with the service role and return `image/webp` bytes. They are `force-dynamic` and never redirect to a signed URL. Vitest mocks `@/lib/storage`. Real Supabase is limited to the hosted manual check.
49. Store `covers/{eventId}/{uuid}.webp` and `avatars/{eventId}/{hostId}/{uuid}.webp`. The slug stays in the public URL only, because saving an event rewrites the slug from the title. An empty compare-and-swap field means `null`.
50. The event action gains venue fields only. Host add and edit live at `/admin/events/[id]/hosts/new` and `/admin/events/[id]/hosts/[hostId]`. Confirm-remove lives at `/admin/events/[id]/cover/remove` and `/admin/events/[id]/hosts/[hostId]/avatar/remove`.
51. Compare `Origin` to `x-forwarded-host` when present, otherwise to `Host`. `EventHost` enables row-level security and revokes `anon` and `authenticated`, with no client policies. Order rewrites park rows on temporary negative positions, then write `0..n-1`, inside one transaction.

Documentation status: the roadmap and Epics 08–14 are documented as **Planned**. This documentation deliverable changes no runtime code, schema, bucket configuration, accounts, or deployment.


## React Hook Form refinement

52. The user's October 2026 instruction supersedes decision 4 and the form-related part of decision 30: use React Hook Form and the Zod resolver for all data-entry forms. Client components are permitted for validation and submission feedback. Keep plain CSS, server-rendered pages, server validation, and server authorization. Editable forms cover login/signup, event creation/editing, host details, images, certificates, and participant search; action-only forms remain native server actions. Follow the official accessibility example with field errors, first-error focus, and pending submission labels.

## Local time and interface refinement — accepted

53. Detect the viewer's device timezone and localize all displayed schedules, timestamps, and date tiles. Use English dates, 24-hour time, and explicit zone/offset labels. SSR and unavailable detection use labeled UTC. This supersedes Q13's UTC-only presentation and the corresponding part of Q36; stored instants and eligibility checks remain UTC.
54. Admin event creation/editing also defaults to device-local schedule entry, with an explicit UTC option. Submit local strings and a validated IANA timeZone, convert independently server-side with Temporal, and default legacy callers to UTC. Reject skipped/repeated local times instead of silently shifting them. Preserve values/zone after errors, valid instants when switching zones, and untouched database instants during edits.
55. Apply UI/UX Pro Max guidance and locally owned shadcn-style Badge/Button patterns customized to the dark plain-CSS design. Awaiting confirmation is amber, confirmed blue, attended/published mint, cancelled/declined rose, and draft/no-show neutral. Keep full labels, accessible contrast, and native interaction semantics.
56. Discovery rows are entire native links, with whole-row focus and hover feedback. Buttons retain readable normal/pending labels, wrap only at words, and grow vertically; search inputs shrink before buttons and stack on small screens.
57. Extend the client-component allowance in Q52 to shared timezone presentation. The device timezone requires no location permission and no account/database timezone migration. See [Epic 18](us/epic-18-local-time-and-interface-refinements.md) for acceptance and verification.

## Registration questions — accepted

53. Collect event-specific answers during registration using short text, long text, single choice, multiple choice, and yes/no. Administrators filter and review responses before manually confirming/declining; no automatic screening.
54. Save drafts and publish immutable questionnaire versions, including after applications arrive. Preserve identities for meaning-preserving corrections and ordering; replace identities when meaning or type changes. Keep historical wording and options with each submission.
55. Submitted answers are read-only. Cancellation retains them; participant reapplication uses the latest version and prefills compatible answers. Administrator reopening keeps the prior submission.
56. Filter unchanged questions across versions. Combine question criteria with AND and selected choices within a question with OR. Missing answers include legacy submissions and versions without that question. Preserve existing registration, capacity, ticket, attendance, and certificate behavior.
57. Implement [Epic 17](us/epic-17-registration-questions-and-filtering.md) using the project-local ui-ux-pro-max skill with the existing dark design system, plain CSS, and accessible React Hook Form/Zod data-entry forms.

## Administrator QR scanner — accepted

58. The October 2026 request adds in-app camera scanning to the administrator event participants page, superseding the scanning exclusion in Q36 and extending the client-component allowance. Start the camera explicitly, prefer the rear camera, stop and release it on exit, and provide permission/retry feedback. Read only same-origin QR review URLs for the selected event; validate signed references and eligibility on the server under ADMIN authorization before opening the existing arrival review. Recording arrival still requires explicit confirmation and preserves arrival windows, idempotency, attendance, and certificate rules.

## Two-scan attendance and HTML certificates — accepted

59. Issue signed QR tickets on application. Administrator approval remains available but is no longer a prerequisite for ticket presentation. Approval preserves the active version; cancellation revokes it and reapplication/reopening issues a fresh one.
60. A valid ADMIN arrival scan automatically confirms attendance (`ATTENDED`) at any time before or after the event. In-app scanning and the authenticated QR landing client bridge submit server actions without a separate review confirmation. GET remains read-only. This supersedes Q21–23, Q27 and the review/attendance parts of Q58. Arrival-only undo is retired because attendance remains terminal.
61. The participant must be scanned again onsite from scheduled end onward, with no deadline (updated by the certificate restriction removal request). A recorded arrival from an earlier scan qualifies, even if it was recorded after the end. That second scan verifies continued presence and atomically issues the certificate; it supersedes the initially proposed immediate issuance. Manual attendance without arrival cannot bypass the first scan; manual arrival cannot bypass final QR verification.
62. Generate certificates as immutable, printable HTML stored in Postgres with random 256-bit public URL tokens. Anyone with the link can open it without login; URLs have no expiry and contain no email or application answers. Event cancellation and later profile/event changes retain issued content. Persistence depends on retaining the domain and database. Keep existing private PDF downloads; retire new uploads/replacements and completion callbacks.
63. Keep original arrival/final-scan timestamps and one certificate under repeated/concurrent scans, preserve RLS and server authorization, and use UI/UX Pro Max with the existing interface system. See [Epic 19](us/epic-19-two-scan-attendance-and-html-certificates.md). These decisions override the conflicting certificate and ticket rules in Q3, Q20–28, Q36 and Epics 03–07.
