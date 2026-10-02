# Refinement Brief: Events & Participants App

You are taking over a working-draft codebase (`events-app.zip`, one Git commit). It was written **without being installed, built, or run**. Treat every file as unverified. Your job is to make it build, harden it, add tests, and prepare it for deployment and submission.

## 1. Original assignment (verbatim intent)

Build a small web app for managing events and participants, with two roles.

**Participant:** sign up and log in; browse events; view event details; register for an event; see events they registered for; access their participation certificate once issued.

**Administrator:** log in to an admin dashboard; create and edit events; view registered participants; change participant status; upload a certificate for a participant.

**Technical requirements:** relational database; authentication and authorization; proper validation; deployed somewhere accessible; Git repository; short README explaining technical decisions.

**Evaluation focus:** engineering decisions, code quality, architecture, and a functional product delivered within the time limit. It is explicitly not expected to be production-ready.

## 2. Decisions already made (keep unless you find a real defect)

| Area | Decision |
|---|---|
| Framework | Next.js 15 App Router, TypeScript, server components and server actions, no client JS |
| DB | Supabase Postgres via Prisma. Pooled URL (6543, `pgbouncer=true`) at runtime, direct URL (5432) for migrations |
| Storage | Supabase Storage, **private** bucket `certificates`, served via 60-second signed URLs |
| Auth | Custom: bcryptjs hashes, random 256-bit token in an httpOnly/SameSite=Lax cookie, only the SHA-256 stored in the `Session` table, 7-day expiry |
| Authorization | `requireUser` / `requireAdmin` called inside every page and action. `role` is never read from client input. Admins are created by the seed script only |
| Validation | Zod schemas on every input, plus DB constraints (unique `(userId,eventId)`, CHECK `endsAt > startsAt`, CHECK `capacity > 0`) |
| Statuses | `REGISTERED → CONFIRMED → ATTENDED | NO_SHOW`, `CANCELLED` from `REGISTERED`/`CONFIRMED`. Enforced server-side in `TRANSITIONS`. Certificates only when `ATTENDED` |
| Concurrency | Registration runs in a **Serializable** transaction (capacity check), plus the unique constraint (duplicates) |
| Certificates | Key = `<registrationId>.pdf`, generated server-side. Checks: `%PDF-` magic bytes and a 5 MB cap. Re-upload overwrites. Non-owners get 404 |
| Supabase hardening | RLS enabled on all tables with **no policies**, so the public REST API exposes nothing; Prisma connects server-side |
| Event lifecycle | `DRAFT` (hidden from participants), `PUBLISHED`, `CANCELLED` |
| Hosting | Vercel + Supabase free tier |

## 3. File map

```
prisma/schema.prisma      User, Session, Event, Registration (certificate fields live on Registration)
prisma/rls.sql            RLS, CHECK constraints, private bucket creation (run manually in Supabase SQL editor)
prisma/seed.ts            Admin from ADMIN_EMAIL/ADMIN_PASSWORD + one sample event
src/lib/auth.ts           Sessions, getUser/requireUser/requireAdmin
src/lib/validation.ts     Zod schemas + TRANSITIONS map
src/lib/storage.ts        Supabase Storage upload + signed URL
src/lib/db.ts             Prisma singleton
src/app/actions.ts        All server actions (signup, login, logout, register, saveEvent, setStatus, uploadCertificate)
src/app/api/certificates/[id]/route.ts   Authenticated certificate download (owner or admin)
src/app/api/health/route.ts              SELECT 1, for keep-alive pings
src/app/**/page.tsx       /, /events/[id], /login, /signup, /my, /admin, /admin/events/[id]
```

## 4. Known issues and risks to verify first (priority order)

**P0: must work before anything else**
1. **Get it building.** Run `npm i`, `npx prisma generate`, `npx tsc --noEmit`, `npm run build`. Fix whatever breaks. Likely suspects:
   - The `fail(): never` helper in `actions.ts` uses `p.data!` after a `safeParse` that is followed by a call typed `never`. Confirm TypeScript narrows correctly, or restructure to early-return/throw.
   - `status: next as never` in `setStatus` is a type escape hatch. Replace with a proper `RegStatus` type guard.
   - `bind(null, ...)` server actions used as `<form action>`: confirm they type-check and return `void | Promise<void>`.
   - Next 15 async `params`/`searchParams` typing.
2. **Verify the end-to-end flow manually** against a real Supabase project: signup → browse → register → admin confirms → marks ATTENDED → uploads PDF → participant downloads.
3. **`prisma db push` vs migrations.** Switch to `prisma migrate` and fold the contents of `rls.sql` into a migration (or document the manual step clearly). Reviewers may prefer committed migrations.

**P1: correctness and security**
4. **Timing-equalisation claim is likely false.** In `login`, the dummy hash string is probably not a valid bcrypt hash, so `bcrypt.compare` may return early. Generate a real bcrypt hash at module load and compare against it for unknown users, or remove the claim from the README.
5. **Participants cannot cancel their own registration.** Only admins can set `CANCELLED`. Add a participant "Cancel registration" action (allowed from `REGISTERED`/`CONFIRMED`, event not yet started) and show it on `/my`.
6. **Lowering capacity below the current registered count** is not guarded in `saveEvent`. Reject it with a clear message.
7. **Cancelling or editing an event with registrants** shows no notice to participants. Show a banner on `/my` and the event page when `status = CANCELLED`; consider an `updatedAt` "event changed" indicator.
8. **Login throttle is in-memory** (per serverless instance, so mostly ineffective on Vercel). Either move it to a DB table keyed by email+window (cheap, no new infra) or state clearly in the README that it is best-effort.
9. **Expired sessions are never purged.** Add cleanup (opportunistic `deleteMany` on login is enough).
10. **Session fixation/rotation:** confirm a new session is issued on login and old sessions for the user are handled sensibly (at least delete the current cookie's session on login).
11. **CSRF:** Next server actions check Origin; confirm no state-changing GET routes exist. The certificate route is GET but read-only.
12. **Security headers** (CSP, `X-Content-Type-Options`, `frame-ancestors`) are not configured. Add them in `next.config`.
13. **Signup enumeration:** the duplicate-email message ("Could not create account with those details") is generic but timing and flow still differ. Acceptable for this scope, so just document it.
14. **Service-role key:** confirm it is used only in `storage.ts` (server-only) and never imported by client code. Add `import "server-only"` to `storage.ts` and `auth.ts`.

**P2: quality and polish**
15. **Timezones:** event times are entered and shown in UTC. Either say so in the UI (already labelled on admin inputs) or store/display in a configurable zone.
16. **Pagination** on `/`, `/admin`, and participant tables (simple `take`/`skip`).
17. **Loading and pending states** for form buttons (a small client component using `useFormStatus` is fine). Add an `error.tsx` and `not-found.tsx`.
18. **Accessibility:** labels on all inputs, focus styles, semantic landmarks.
19. **Certificate model:** currently two nullable columns on `Registration`. Defensible for one-per-registration. If you change it to a `Certificate` table, do it for a stated reason, not for its own sake.

## 5. Work to add (accepted recommendations from the planning phase)

### 5.1 Tests (highest value for evaluators)
Use Vitest (or Playwright for a couple of flows) against a **separate test database** (a second Supabase project or local Postgres via Docker). Prioritise authorization boundaries over breadth:
- Participant cannot reach `/admin/*` or invoke admin actions (`saveEvent`, `setStatus`, `uploadCertificate`).
- Anonymous user is redirected to `/login` from `/my`, `/admin`, and gets redirected from `/api/certificates/:id`.
- **User A cannot download user B's certificate** (expect 404); admin can; owner can.
- Duplicate registration is rejected; two concurrent registrations for the last seat result in exactly one success.
- Invalid transitions are rejected (e.g. `REGISTERED → ATTENDED`, `CANCELLED → CONFIRMED`).
- Certificate upload rejects: non-PDF with a `.pdf` extension, a file over 5 MB, a registration not `ATTENDED`.
- Signup ignores a client-supplied `role` field.
- Zod schemas: invalid email, short password, `endsAt <= startsAt`.

Refactor as needed for testability. For example, extract the business logic from `actions.ts` into `src/services/*.ts` that take a user and plain args, so the actions become thin wrappers that parse `FormData` and redirect. This is also the layered architecture the original plan described, and it is currently only partly realised.

### 5.2 CI and keep-alive
- `.github/workflows/ci.yml`: install, `tsc --noEmit`, lint, test.
- `.github/workflows/keepalive.yml`: scheduled daily `curl` to `https://<deployed-url>/api/health`. (The README mentions this, but **the workflow file does not exist yet**.)

### 5.3 Deployment
- Vercel project with env vars from `.env.example`. Build command is already `prisma generate && next build`.
- Confirm Prisma works with the pooled connection in serverless (`pgbouncer=true`, `directUrl` for migrations).
- Add a one-command seed step to the README for the deployed DB, and put demo admin credentials in the submission notes (not in the repo).
- Verify the deployed URL end-to-end with the manual flow from P0.2.

### 5.4 Documentation
- Keep the README **short** (the assignment says short). Make sure every claim in it is true after your changes (especially auth timing and rate-limit statements).
- Add a "What I'd do next" section: email verification, password reset, notifications, audit log, Redis-based rate limiting, certificate versioning, i18n and time zones.

## 6. Constraints for the refinement

- Keep the stack. Don't swap frameworks or add Auth.js or Supabase Auth. Custom auth is a deliberate, documented choice.
- Don't add client-side state libraries or UI frameworks. Plain CSS is fine.
- Don't weaken any security decision in section 2.
- Prefer small, reviewable commits with clear messages (the repo history is part of what is evaluated).
- Never commit `.env` or any key. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Don't expand scope into features not in the assignment, apart from items listed above.

## 7. Definition of done

- [ ] `npm run build`, `tsc --noEmit`, lint, and tests all pass locally and in CI
- [ ] Full participant and admin flows verified manually on the **deployed** URL
- [ ] Authorization tests in 5.1 exist and pass, especially the cross-user certificate test
- [ ] README is short, accurate, and covers setup, decisions, limitations, and next steps
- [ ] Public Git repo with a sensible commit history; deployed URL and demo admin credentials recorded for the submission
- [ ] No secrets in the repo; RLS and the private bucket confirmed in Supabase

## 8. Questions to flag back to the human rather than guessing

- Is the status model (`REGISTERED/CONFIRMED/ATTENDED/NO_SHOW/CANCELLED`) acceptable, or does the assignment's author expect something simpler (for example `pending/approved/rejected`)?
- Should participants be able to cancel their own registration?
- Should a certificate be replaceable after issue, or is first-upload final?
