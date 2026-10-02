# eevents

eevents helps organizations publish workshops and training, collect participant applications, and manage attendance. Applying reserves a place and issues a private QR ticket. An administrator’s arrival scan confirms attendance; a second onsite scan after the event ends verifies the participant stayed and generates a printable HTML certificate with a shareable, non-expiring URL. Existing private PDF certificates remain downloadable.

## Local setup

Requires Node.js 22+, pnpm, and Docker. Certificate function deployment also requires the Supabase CLI.

```sh
pnpm install
cp -n .env.example .env
pnpm dev:db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

If `.env` already exists, add any missing variables from `.env.example`. Prisma needs both `DATABASE_URL` and `DIRECT_URL`; Supabase API keys do not supply a Postgres connection. Replace the example admin email and password before seeding. The seed command creates or updates that account as `ADMIN`, sets its password from `ADMIN_PASSWORD`, and creates one draft sample event. Local Postgres is mapped to port `55432`; stop it with `pnpm dev:db:down` when finished. For Supabase, set `DATABASE_URL` to the pooled port `6543` URL with `pgbouncer=true` (use `&pgbouncer=true` if it already has query parameters). The Prisma 6 runtime also enables this option automatically for Supabase transaction pooler hosts to avoid prepared-statement collisions. Set `DIRECT_URL` to the direct port `5432` URL. Retain the private certificate bucket for existing PDF certificates; its setup is versioned in `supabase/setup-storage.sql`. New HTML certificates do not require that bucket. Apply `supabase/setup-event-media.sql` separately for the private `event-media` bucket (WebP only, 1 MiB, not public). That script does not change certificates. Image uploads reuse the server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; there are no browser storage credentials. The app process must be the Node.js runtime, with Sharp installed, a writable temp directory, and a proxy that accepts at least a 3 MB request body. Interrupted `eevents-image-` directories and storage objects that are not a current cover or avatar key are reconciled manually with `pnpm exec tsx scripts/reconcile-event-media.ts` (`--apply` deletes). There is no admin cleanup button and no scheduled job. New HTML certificates require the database and stable application origin, with no storage function. On existing hosted installations, redeploy `certificate-upload` to activate its retirement response; new uploads and replacements return 410. Keep private storage/API credentials for legacy PDF downloads and event media. Set `APP_ORIGIN` and `CHECKIN_SIGNING_SECRET` for QR tickets. The service-role key stays server-side.

After changing the Prisma schema, run `pnpm db:generate` and restart `pnpm dev`. The running development server caches its Prisma Client across hot reloads; a newly generated client on disk does not replace that instance.

## Tests and CI

Copy `.env.test.example` to `.env.test`, start the isolated Postgres container, and run the tests. The test runner applies committed migrations and refuses database URLs outside the dedicated local `eevents_test` database.

```sh
cp .env.test.example .env.test
pnpm test:db:up
pnpm test
pnpm test:db:down
```

GitHub Actions runs typecheck, lint, tests, and a production build on pushes and pull requests. The daily health check needs the repository variable `DEPLOYED_URL` set to the HTTPS origin of the deployment.

For a deployed database, run `pnpm db:deploy` and then `pnpm db:seed` once from a trusted environment with the production connection strings and admin credentials set. Keep those credentials outside Git.

## Decisions and limits

- Next.js App Router, TypeScript, Prisma, and Supabase Postgres. Runtime and migration connections are configured separately.
- Custom sessions use bcrypt password hashes and random 256-bit httpOnly cookies; only SHA-256 token hashes are stored in Postgres. Signup always creates participants; administrator access comes from the seed script.
- Application tables have RLS enabled and no public policies. Supabase service credentials are used only by server-side certificate storage code.
- Event times display in the viewer’s device timezone. Admin schedule entry defaults to that timezone, with an explicit UTC option; validated local times are converted to UTC for storage. Server-rendered/no-JavaScript output uses labeled UTC. Skipped or ambiguous daylight-saving input is rejected rather than silently shifted. Participant registrations reserve capacity immediately and issue signed QR tickets. Arrival scanning records ATTENDED at any time, before or after the event. A second onsite QR scan at any time after the end verifies continued presence and creates an immutable HTML certificate. A recorded arrival from an earlier scan is mandatory; late arrivals qualify. Scans require a stored ADMIN role and preserve first timestamps under retries. Certificate links are public to anyone with the unguessable URL and never expire. Old PDF downloads remain owner/admin-only through storage links that expire after 60 seconds.
- The unknown-account bcrypt comparison uses a valid cost-12 hash to reduce timing differences; it does not make timing identical. The in-memory login throttle is best-effort and does not coordinate across Vercel instances.
- Duplicate signup responses are generic, though differences in database and hashing work can still reveal timing clues. No hosted Supabase project or deployment is configured yet, so deployed end-to-end verification remains outstanding.

For signed ticket links, set `APP_ORIGIN` to the canonical application origin and generate a private `CHECKIN_SIGNING_SECRET` with at least 32 random bytes. Keep both values outside Git.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` for local checks. The test command requires the separate test database to be running.

## What I'd do next

Deploy the storage function and app, then verify the participant and administrator flows on the hosted URL. Follow with email verification, password reset, notifications, audit logging, Redis-based rate limiting, certificate versioning, and internationalized time zones.
## Registration questions

From **Admin → event operations → Registration questions**, add and order up to 20 questions, save a draft, preview it, and publish. Questions support short/long text, single/multiple choice, and yes/no. Participants answer during application; admins can review answers and combine filters on the event's participant list before confirming or declining.

Published questionnaires are versioned. Clarifying wording preserves question identity and cross-version filtering; changing meaning requires replacing the question. Submitted answers stay read-only. Participant cancellation retains them, and a successful reapplication replaces them using the current version. Existing events need no questions and legacy applications remain valid.

The additive Prisma migration creates private questionnaire/answer tables with RLS and revoked Supabase API-role privileges. Deploy it using the existing `pnpm db:deploy` workflow before serving the updated application. No bucket or other Supabase platform configuration is added.

Product stories and verification are in [Epic 17](plan/us/epic-17-registration-questions-and-filtering.md).

### QR check-in from the administrator page

Open an event under Admin and select **Scan QR code**. Allow camera access and scan the participant’s ticket. The arrival scan automatically confirms attendance. Ask participants to show the same QR again after the scheduled end; the final scan verifies they stayed onsite and issues their HTML certificate. Final scans have no deadline after end and require an earlier arrival. A first scan after end records arrival; a subsequent scan issues the certificate. Built-in phone cameras also open the protected automatic scan page. Camera access requires HTTPS or localhost; codes must belong to the selected event and configured origin. Manual arrival is available at any time, but certificate issuance requires the final QR scan.

### Lasting HTML certificates

After final verification, My Events and admin participant records offer **View certificate**. Copy the page URL to reopen or share it later without login; use the browser’s Print command to print or save a PDF. The document is stored in Postgres with inline CSS and freezes names, event details and organizer at issue time. Back up the database and retain the domain to keep links valid. No certificate is issued by a timer or by marking attendance alone. See [Epic 19](plan/us/epic-19-two-scan-attendance-and-html-certificates.md).
