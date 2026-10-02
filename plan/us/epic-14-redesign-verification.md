# Epic 14 — Redesign verification

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md).

## Outcome

Demonstrate that the redesigned experience is readable, safe, and functional locally and on the target deployment.

## Stories

### US-14.1 — Verify visual and accessibility behavior

**As a user**, I want the interface to remain usable across devices and content lengths.

**Acceptance criteria**

- Review discovery, My Events, detail, ticket, authentication, admin editing, the admin event index, participant records, check-in, and certificates at 320, 360, 768, and 1440px.
- Cover long titles, names, email, biographies, and descriptions. Cover missing artwork, hosts, and venue. Cover empty lists, validation errors, and storage errors.
- Verify no horizontal overflow, 200% text scaling, keyboard reachability, and visible focus. Verify WCAG 2.2 AA contrast, 24px targets, 44px dock items and primary buttons, reduced motion, semantic labels, dock clearance, and focus not fully hidden under the dock.
- On viewports below 1024px, confirm the event action appears after the schedule and again after the description, above the dock. At 1024px and above, confirm a single top-aligned registration action.
- Confirm login and signup have no dock, and that the dock is hidden from 768px upward.
- Capture review screenshots with non-sensitive fixture data and compare composition against the relevant reference, especially IMG_6398.PNG for the ticket. Do not commit screenshots.
- Scan the ticket QR and verify its quiet zone and download at representative mobile sizes, including a 320px-wide layout.

### US-14.2 — Verify data, authorization, and upload failures

**As a maintainer**, I want evidence that the redesign preserves protected workflows.

**Acceptance criteria**

- Use the isolated local Postgres test configuration for additive migrations, metadata validation, host ordering and the 10-host cap, event authorization, and ticket owner/admin access.
- Cover image pipeline limits, `Origin` checks against `x-forwarded-host` or `Host`, malicious inputs, the 1 MiB output cap, quality 80 and 60, storage and database failures, temporary cleanup, compare-and-swap races, confirmed removal, and orphan reconciliation as specified in Epic 10. Mock storage in Vitest. Use real Supabase only for the hosted manual flow.
- Assert draft image routes reject non-admins, published and cancelled reads use `private, max-age=60`, and responses do not depend on the Next.js image optimizer.
- Run existing registration, capacity, cancellation, confirmation, check-in, and certificate regression coverage. Add focused tests for changed contracts rather than tests that merely mirror CSS.
- Verify that signed QR payloads contain no PII, draft images are protected, private certificate behavior is intact, and credentials are absent from browser responses and tracked files.

### US-14.3 — Complete local and hosted release evidence

**As an operator**, I want a reproducible handoff with remaining setup clearly identified.

**Acceptance criteria**

- Inspect package scripts before running the actual typecheck, lint, test, and build commands. Generate Prisma as required by the repository. Record results and any unresolved failures.
- Document and apply additive migrations and the separate private image-bucket setup to the authorized environment during implementation. Verify temporary-directory and Sharp support there.
- Manually verify the hosted admin upload, replace, and confirm-remove flow, plus participant discovery, application, confirmation, QR review and check-in, attendance, and the private certificate journey.
- Confirm error feedback and cleanup behavior with safe test fixtures. Run the operator reconciliation script only against fixtures, and confirm it does not delete a live cover or avatar key.
- Keep credentials and personal screenshot content outside version control.
- Write the verification record in [plan/redesign-verification.md](../redesign-verification.md). Update implementation status only for work supported by evidence. Identify any outstanding hosted setup or publication rather than marking the redesign complete prematurely.

## Verification record

During implementation, record commands and results, viewport coverage, contrast and target-size checks, QR scan outcome, hosted storage checks, and remaining limitations in `plan/redesign-verification.md`. This planned epic contains no current pass claims. Do not create that file until there are results to record.

## Dependencies and scope

Final gate after Epics 08–13. Existing deployment and publication requirements still apply. This documentation task neither deploys nor publishes the application.
