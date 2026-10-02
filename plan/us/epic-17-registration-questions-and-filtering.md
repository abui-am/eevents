# Epic 17 — Registration questions and participant filtering

**Status: Implemented locally.** Automated verification passes; full responsive and hosted manual verification remains pending.

## Outcome

Event administrators collect event-specific information during registration and filter applications by the submitted answers before manually confirming or declining participants. Registration still reserves capacity immediately; answers do not automatically approve or reject anyone.

## Stories

### US-17.1 — Configure registration questions

**As an administrator**, I want to add and order questions so I can collect information relevant to selecting participants.

**Acceptance criteria**

- Manage questions at `/admin/events/[id]/questions`, reachable from event operations.
- Support short text, long text, single choice, multiple choice, and yes/no. Each question has a label, optional helper text, required setting, and order. New questions default to optional.
- Add, edit, remove, move up/down, and preview questions. Limit to 20 questions, labels to 200 characters, helper text to 500, and 2–20 distinct nonblank choices of at most 100 characters.
- Short answers allow 200 characters and long answers allow 2,000. Whitespace-only answers are omitted; an unanswered optional yes/no differs from No.
- Use accessible React Hook Form/Zod forms, explicit labels, inline errors, first-error focus, retained input, and pending feedback. Follow the project-local ui-ux-pro-max skill while preserving DESIGN.md and plain CSS.
- Only ADMIN may manage questions; block mutations once the event starts or is cancelled.

### US-17.2 — Publish immutable versions

**As an administrator**, I want to revise questions without rewriting earlier applications.

**Acceptance criteria**

- Save draft edits separately and explicitly publish an immutable version. Participants see only the latest published version. Show unpublished changes and explain that publishing affects future applications.
- Preserve stable question identities for wording corrections, helper text, required-setting, and order changes. Wording corrections must preserve meaning. Different meaning requires replacement; changing type always replaces identity.
- Preserve option identities for label corrections; different meaning requires a new option. Retain removed questions/options in historical snapshots and filters.
- Publishing an empty questionnaire removes questions from future applications while retaining previous responses.
- Use revision checks to reject concurrent draft saves or publication with reload guidance.

### US-17.3 — Answer when applying

**As a participant**, I want to answer the event's questions when applying so the administrator can assess my application.

**Acceptance criteria**

- Events with questions open `/events/[slug]/apply`; questionnaire-free events retain the existing application flow. Require authentication and preserve a safe login return.
- Display published questions in order and validate required fields, types, limits, and options on the server against the authoritative version.
- Save answers, submitted version, registration, and capacity reservation atomically in the existing Serializable transaction. Invalid answers consume no capacity.
- A publication during form completion requires reviewing the new version; retain compatible entered answers and write no registration until resubmitted.
- Preserve REGISTERED, event deadlines, duplicate prevention, ticket issuance after confirmation, and cancellation rules.

### US-17.4 — Review private submissions

**As an administrator**, I want to review the original answers alongside eligible approval actions.

**Acceptance criteria**

- Add answer links to protected participant rows and a review at `/admin/events/[id]/registrations/[registrationId]/answers` with the original question wording, option labels, and submitted version.
- Participants can view only their own read-only submission at `/my/registrations/[id]/answers`. Display Not answered for omissions and No questionnaire submitted for legacy registrations.
- Cancellation retains answers. Participant reapplication uses the latest questionnaire, prefills compatible previous values, and replaces the old submission only after a successful transaction. Administrator reopening retains submitted answers/version.
- Never expose responses in public pages, tickets, redirect URLs, or logs. Scope every lookup to its event and authenticated role/owner.

### US-17.5 — Filter by answers

**As an administrator**, I want to combine answer filters so I can find applicants matching my event's needs.

**Acceptance criteria**

- Choice filters match any selected option within one question; different question predicates combine with AND, alongside name/email, status, and arrival filters.
- Text supports case-insensitive literal contains. Every type supports Answered and Not answered; yes/no also supports Yes and No.
- Filter across versions using stable question/option identities. Label removed options/questions as historical. Older submissions without the question count as Not answered.
- Show removable active filters, clear-all, matching counts, and a useful empty state. Reject malformed/cross-event criteria rather than silently widening the results.
- Filter before counting and pagination. Status counts respect search, arrival, and answer criteria before applying the selected status. Preserve criteria through navigation and reset to page 1 when they change. Keep 20-row pagination.
- Example: Experience = Beginner AND Needs certificate = Yes returns only applications satisfying both.

## Interfaces and implementation

Add event-owned questionnaire drafts with revision counters, immutable version snapshots with stable UUID question/option identities, current/submitted version references, and typed registration answers. Commit additive Prisma migrations with constraints, indexes, and RLS restrictions matching the existing private application tables. Existing rows need no backfill.

Extend registration input with submitted version and answers, and return structured validation/version-change feedback. Extend participant queries with validated answer predicates. Client components are limited to editable forms and feedback; pages, authorization, and queries remain server-side.

## Verification

Cover all question types and limits, required/optional fields, historical wording/identities, removed choices, malformed and cross-event input, concurrent draft/publish/submission, atomic rollback and last-seat races, combined filters/counts/pagination, ADMIN and owner access, cancellation/reapplication/reopening, accessible DOM interactions, and mobile layouts. Run typecheck, lint, tests, and production build. Hosted manual verification is separate and requires deployment access.

### Results — 3 October 2026

- `pnpm typecheck`: passes.
- `pnpm test`: 137 tests pass across 25 files. Epic 17 adds 21 schema/service/database/authorization/navigation tests and five DOM interaction tests.
- `pnpm lint`: no errors; only four existing Next.js image warnings on admin image views.
- Production compilation, type checks, page generation, and build traces pass. The final build ran in a temporary project copy with the installed dependencies and the same environment, leaving the running development server's cache alone. An earlier `pnpm build` also passed in the workspace.
- The additive migration is applied to the local development and isolated test databases. RLS metadata is verified for all three new tables. No hosted database was changed.
- Chrome desktop inspection confirms the protected question editor renders using the existing dark system. Browser automation became unreliable amid concurrent browser/workspace activity; participant/filter screenshots, the full responsive matrix, reduced-motion review, and hosted end-to-end verification are not claimed as complete.
- Temporary local QA accounts, their event, and sessions were removed. Existing data and unrelated workspace changes were retained.

## Dependencies and exclusions

Depends on Epics 03, 04, and 16. Automatic screening, scoring, conditional questions, uploads, templates, exports, and bulk approval are deferred.
