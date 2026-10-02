# Epic 01 — Platform, identity, and security

## Outcome

Restore the supplied application, make its foundation reproducible, and enforce the agreed authentication, authorization, and data-security boundaries.

## Stories

### US-01.1 — Restore and verify the source

**As a developer**, I want to inspect and build the supplied code before changing it, so the refinement starts from verified facts.

**Acceptance criteria**

- Locate the source archive or repository, inspect its files, Git history, environment example, package scripts, and project instructions.
- Keep existing history and verify secrets are excluded before any commits.
- Install dependencies, generate Prisma Client, run TypeScript checking, and build successfully; confirm actual lint and development scripts before relying on them.

### US-01.2 — Reproduce database and storage setup

**As a developer**, I want versioned database setup and a separate test database, so local work and deployment use documented structures.

**Acceptance criteria**

- Use Supabase Postgres through Prisma: pooled runtime URL and direct migration URL.
- Commit schema, uniqueness and CHECK constraints, and application-table RLS in Prisma migrations.
- Version private `certificates` bucket setup in a separate Supabase SQL script and document how to apply it.
- Use isolated local Postgres for automated tests; provide an idempotent seed for the server-created admin and sample event.
- Include the ticket-version and arrival fields from Epic 07 in the application migrations, with an administrator relation for the recorded check-in actor.

### US-01.3 — Create participant accounts and sessions

**As a participant**, I want to sign up, sign in, and sign out, so I can register for events and reach my certificates.

**Acceptance criteria**

- Validate signup and login input on the server; ignore any client-supplied role and assign participant role server-side.
- Store bcrypt password hashes; use a valid precomputed dummy hash for unknown-user comparisons with a matching work factor.
- Issue a new random 256-bit token in a seven-day httpOnly, SameSite=Lax cookie; store only its SHA-256 hash in `Session`.
- On login, delete the session represented by the current cookie and retain other active sessions. On logout, delete the current session and clear the cookie.
- Opportunistically remove expired sessions at login. Document the in-memory login throttle as best-effort across Vercel instances; describe bcrypt comparison as reducing timing differences, not eliminating them.

### US-01.4 — Protect application boundaries

**As a user**, I want pages, actions, and certificate data restricted to the right role, so private operations cannot be invoked by guessing a URL or form value.

**Acceptance criteria**

- Require a user or administrator inside every protected page, action, and certificate route; derive role from the stored user only.
- Keep custom auth and storage modules server-only. Keep the Supabase service-role key out of client-importable modules.
- Enable RLS without public policies. Preserve owner/admin certificate access and 404 responses for other authenticated users.
- Configure compatible CSP, `frame-ancestors`, and `X-Content-Type-Options` headers.
- Keep state-changing operations in server actions; certificate and health GET routes remain read-only.
- Protect ticket pages and QR-image GET routes for the owner or administrator. Administrator check-in review pages and actions require administrator authorization. QR possession grants no authorization.
- Keep the dedicated `CHECKIN_SIGNING_SECRET` server-only and outside version control. Return private, non-cacheable ticket/review responses with `Referrer-Policy: no-referrer`.

## Dependencies

US-01.1 must complete before code edits. US-01.2 supports all database-backed stories; US-01.3 and US-01.4 unblock participant and administrator flows.

## Not included

Supabase Auth, Auth.js, client-side state libraries, multi-factor authentication, and production-grade distributed rate limiting.
