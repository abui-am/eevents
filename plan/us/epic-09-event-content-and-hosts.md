# Epic 09 — Event content and hosts

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md).

## Outcome

Let administrators maintain real artwork references, venue details, and ordered host profiles while keeping existing events valid.

## Stories

### US-09.1 — Extend event content safely

**As an administrator**, I want optional richer event information without having to rebuild existing events.

**Acceptance criteria**

- Add nullable fields through a committed additive Prisma migration: `coverKey` (`VarChar(300)`), `venueName` (`VarChar(160)`), `venueAddress` (`VarChar(300)`), and `mapUrl` (`VarChar(1000)`).
- Enable row-level security on `EventHost` and revoke `anon` and `authenticated`, with no client policies. Match the existing application tables. Prisma remains the trusted server connection.
- Preserve existing `location` and description. Consumers use `venueName` when set and fall back to `location` for a single place line. Address and map URL are detail-only.
- Validate bounded lengths server-side. Accept only HTTPS map URLs and reject other schemes. Optional fields may be cleared through native forms.
- Existing rows remain valid without backfilled or fabricated artwork and venue data. Preserve event lifecycle restrictions and ADMIN authorization.

### US-09.2 — Manage ordered hosts

**As an administrator**, I want to add and maintain event hosts so participants know who is organizing the event.

**Acceptance criteria**

- Add event-owned host records with required `name` (`VarChar(100)`), optional `biography` (`VarChar(500)`), optional `publicEmail` (`VarChar(320)`), optional `avatarKey` (`VarChar(300)`), and `displayOrder`. Allow at most 10 hosts per event. Deleting an event deletes its hosts. `@@unique([eventId, displayOrder])`.
- Venue fields are saved by the existing event create and update actions. Host and image mutations are separate actions.
- Add and edit hosts at `/admin/events/[id]/hosts/new` and `/admin/events/[id]/hosts/[hostId]`. The event edit page lists hosts and submits move up, move down, and remove. Scope every mutation to the authorized event and host.
- After every add, remove, and swap, rewrite that event’s `displayOrder` values to `0..n-1` in the same transaction. Park rows on temporary negative positions before writing the final sequence so the unique pair does not collide. The first host is always order 0.
- Label `publicEmail` as publicly visible before saving it. Never derive it from a user account email.
- Validate names, biographies, email, the host cap, and ordering server-side. Preserve data and show actionable feedback on failure.
- Removing a host coordinates avatar cleanup through Epic 10 without exposing credentials or deleting another host’s image.

### US-09.3 — Supply authorized presentation data

**As a participant**, I want accurate event and ticket details without exposing private account information.

**Acceptance criteria**

- Extend event queries with optional venue fields and hosts ordered by `displayOrder`. Preserve public draft restrictions and list pagination.
- List rows receive the first host’s name only, plus `venueName` or `location`. They do not receive host email, address, or map URL.
- Extend protected ticket presentation with participant email, recorded arrival time, event slug, and one place line: `venueName` when set, otherwise `location`.
- Keep participant name and email on owner/admin-authorized ticket responses only. Public host contact remains distinct from private account data.
- Store image object keys, never temporary paths or expiring signed URLs. Image writes are owned by Epic 10.

## Interfaces and data

Use the existing event and ticket service boundaries. The event form owns venue text. Host forms live on the host routes above and include that host’s avatar actions from Epic 10. No rich-text editor or client-side host manager is required.

## Verification

Test migration compatibility with existing events, metadata and HTTPS validation, the 10-host cap, packed order after add, swap, and delete, cross-event host mutation attempts, non-admin rejection, and ticket owner/admin access. Check public output contains no private participant email and no host email on list payloads.

## Dependencies and scope

Depends on existing event authorization and follows Epic 08. Supplies Epic 10’s storage references and Epic 11’s content. Public guest lists and automatic account-to-host publishing are excluded.
