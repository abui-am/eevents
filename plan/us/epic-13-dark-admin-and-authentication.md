# Epic 13 — Dark admin and authentication

**Status: Planned.** Part of the [redesign roadmap](../dark-luma-redesign.md).

## Outcome

Carry host, venue, and image workflows through the dark admin and authentication surfaces without weakening existing controls.

## Stories

### US-13.1 — Make authentication clear and consistent

**As a user**, I want readable account forms and a reliable return to my intended event.

**Acceptance criteria**

- Apply the shared dark typography, fields, feedback, and light primary controls to login and registration. These pages do not show the mobile dock.
- Preserve native forms, session handling, login throttling, validation, and safe local return paths.
- Use plain field labels and specific errors. Retain safe entered values and keyboard focus visibility.

### US-13.2 — Maintain event content through native admin forms

**As an administrator**, I want event editing and image management organized clearly.

**Acceptance criteria**

- Extend the existing event create and update forms with venue fields only. Cover upload, replace, and remove stay separate forms on the edit page.
- List hosts on the edit page with move up, move down, and remove. Add and edit a host, including its avatar, at `/admin/events/[id]/hosts/new` and `/admin/events/[id]/hosts/[hostId]`.
- Connect those forms to Epic 09 and Epic 10. Upload and replace show persistent inline results. Remove uses the confirmation routes in Epic 10.
- At the relevant controls, explain that host contact email is publicly visible, and that images must be JPEG, PNG, or WebP up to 2 MiB.
- Preserve ADMIN-only authorization, capacity constraints, schedule locks, publication restrictions, and final event cancellation.
- Do not use image URL-pasting as the image interface.

### US-13.3 — Adapt administrative records and operations

**As an administrator**, I want to manage participants and arrivals on desktop or a phone.

**Acceptance criteria**

- Keep the admin event index as a dense text list: title, lifecycle, UTC schedule, registration count and capacity, and a management link. Do not rebuild it with discovery artwork rows. Covers and hosts appear on the edit page and on participant surfaces.
- Keep semantic participant tables on desktop. Provide labeled, readable records on mobile without losing field associations or actions.
- Apply the dark patterns from Epic 08 to confirmation, decline and reopen, attendance, manual check-in, scanned review, undo, and certificate upload and download. This epic does not invent a second visual system for those pages.
- Clearly distinguish registration, recorded arrival, attendance, and certificate state.
- Preserve explicit server-action confirmation, existing check-in time bounds, race safety, and private certificate access.
- Keep notices, destructive actions, and validation readable without relying on color or hover.

## Verification

Manually walk login return, event editing, host reorder and removal, image upload, replace, failed upload, and confirm-remove, plus participant transitions, check-in and undo, and certificate operations at mobile and desktop sizes. Verify non-admin rejection at action endpoints as well as navigation visibility. Confirm the admin index has no artwork rows.

## Dependencies and scope

Depends on Epics 08–12 and existing administrative services. Epic 08 has already restyled current admin pages. This epic adds the venue, host, and image workflows and checks the operational pages against the shared system. Account seeding and account-role changes are not new deliverables. Preserve the established admin setup. No additional staff roles or custom client JavaScript are introduced.
