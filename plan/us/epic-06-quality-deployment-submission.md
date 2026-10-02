# Epic 06 — Quality, deployment, and submission

## Outcome

Verify the agreed behavior with isolated tests, automate repeatable checks, deploy the application, and prepare accurate submission materials.

## Stories

### US-06.1 — Test schemas, authorization, and business rules

**As a maintainer**, I want automated tests against isolated local Postgres so core security and lifecycle behavior is repeatable.

**Acceptance criteria**

- Use Vitest and local Postgres; tests apply the committed application migrations.
- Verify invalid email/password/date/capacity input, role-field tampering, and invalid registration transitions.
- Verify anonymous redirect and participant denial for protected pages/actions; verify admin-only event/status/certificate actions.
- Verify certificate owner/admin success, cross-user 404, upload PDF magic and 5 MB rejection, and attended-only upload.
- Verify duplicate registrations, exactly one successful last-seat race, cancellation origin, participant re-registration, administrator reopening, and timing boundaries.
- Verify the Epic 07 ticket/check-in tests: approval gating, owner/admin access, read-only previews, invalid/revoked/cross-event codes, duplicate races, check-in/cancellation races, time boundaries, manual fallback, undo, and arrival without certificate eligibility.

### US-06.2 — Run checks in CI and keep the deployment awake

**As a maintainer**, I want CI checks and health monitoring so broken changes and unavailable deployment are visible.

**Acceptance criteria**

- CI installs dependencies and runs Prisma generation, TypeScript check, lint, tests, and production build.
- A daily scheduled workflow requests the configured deployment’s `/api/health` endpoint and fails on non-success responses.
- The health endpoint performs a read-only database check and returns no secrets or user data.

### US-06.3 — Deploy and manually verify the complete flow

**As an evaluator**, I want an accessible deployment so I can try the participant and administrator workflows.

**Acceptance criteria**

- Deploy on Vercel with Supabase Postgres and private Storage using credentials provided outside the repository.
- Apply migrations and the documented private-bucket setup; confirm RLS and bucket privacy in Supabase.
- Run the deployed flow: participant signup/login, browse, apply; administrator confirms; ticket appears in My Events; administrator scans with a second phone, reviews and confirms arrival; administrator separately records attendance and uploads/replaces PDF; participant downloads; verify cross-user access is 404.
- Rescan to verify duplicate feedback. Exercise manual fallback, cancellation revocation, and a newly issued QR after reapplication/confirmation. Keep an internet connection on the administrator device.
- Record deployment URL and observed verification results. Review the concrete public-repository/deployment result before publishing.

### US-06.4 — Prepare accurate submission documentation

**As an evaluator**, I want concise setup and design notes so I can understand how the application works and what remains limited.

**Acceptance criteria**

- Keep README short and accurate: stack, setup, migration/storage setup, seed command, authentication/storage decisions, and known limits.
- State that login throttling is best-effort and bcrypt comparison reduces rather than eliminates timing differences.
- Explain account-only ticket delivery, the QR check-in window, administrator review/confirmation, and the separation of arrival from attendance. Document `CHECKIN_SIGNING_SECRET` configuration without including its value.
- Include “What I’d do next”: email verification, password reset, notifications, audit log, distributed rate limiting, certificate version history, and internationalization/time zones.
- Keep demo admin credentials in private submission notes, never in Git.

## Dependencies and release gate

Run these stories after the feature epics are in place. Release only when local build, TypeScript, lint, and tests pass; deployed Supabase protections are confirmed; and the full deployed participant/admin flow succeeds.

## Current implementation status

Local test infrastructure, CI, the daily health workflow, and the read-only health route are implemented. Database-backed tests cover validation, signup role tampering, protected routes/actions, certificate owner/admin access, cross-user certificate denial, upload validation and eligibility, registration races/transitions/cancellation, ticket presentation, and administrator check-in authorization, eligibility, races, manual fallback, and undo. Supabase/Vercel deployment, hosted verification, public repository review, and private demo credentials remain external submission steps.
