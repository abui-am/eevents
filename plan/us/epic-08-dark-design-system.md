# Epic 08 — Dark design system

**Status: Planned.** See the [redesign roadmap](../dark-luma-redesign.md) for scope and reference assessment.

## Outcome

Give every existing route a coherent dark interface with readable typography, clear controls, and navigation suited to mobile and desktop.

## Stories

### US-08.1 — Define the shared design contract

**As an implementer**, I want one current design contract so pages use consistent visual rules.

**Acceptance criteria**

- Revise [DESIGN.md](../../DESIGN.md) during implementation to match this epic and remove conflicting light-theme instructions.
- Start from near-black `#101112`, charcoal `#202223`, off-white text, muted gray, subtle borders, mint success, and light primary controls with dark labels. Finalize a token only after it meets the contrast bar below.
- Primary actions use a light fill and dark label. Mint and green indicate success, not the default primary action.
- Meet WCAG 2.2 AA before tokens are final: text at least 4.5:1, large text and non-text UI at least 3:1, and pointer targets at least 24px. Dock items and primary buttons are at least 44px.
- Define plain-CSS tokens for surfaces, text, borders, actions, focus, errors, success, spacing, radii, and typography. Document their intended uses and the measured contrast.
- Self-host TikTok Sans headings and retain Geist body text with system fallbacks. Avoid unnecessary font weights and layout shifts.
- Use 16px mobile gutters, roughly 12px control radii, and 16px panel radii. Support long titles without clipping or forced decorative line breaks.
- Use restrained CSS hover, focus, and pressed feedback. Honor reduced motion. Introduce no custom client JavaScript or UI framework.

### US-08.2 — Make navigation fit the user’s role

**As a visitor, participant, or administrator**, I want visible destinations appropriate to my account.

**Acceptance criteria**

- Below 768px, show a fixed rounded dock with Events, My events, and Admin when that destination is authorized. Keep the wordmark and account actions in the header: name and Sign out, or Log in and Sign up.
- At 768px and above, hide the dock and use the compact header navigation. Login and signup never show the dock.
- Keep the current sentence-case labels. Identify the current destination semantically. Preserve the skip link, login, logout, safe return paths, and server authorization.
- Keep page content and keyboard focus clear of the dock and device safe areas, including `scroll-padding` and page padding. A focused control must not be fully hidden under the dock.
- All controls are reachable by keyboard, have visible focus, and meet the target sizes in US-08.1. Add no placeholder Chat or notification destinations.

### US-08.3 — Share feedback and form patterns

**As a user**, I want clear feedback that remains readable on dark surfaces.

**Acceptance criteria**

- Provide consistent native buttons, links, labeled inputs, status labels, notices, empty states, errors, and section dividers.
- Distinguish statuses with text as well as color. Connect field errors to their inputs and preserve entered values where safe.
- Keep one obvious primary action per workflow. Repeating that same action is allowed only where Epic 11 places it twice on the event page.
- Use plain, specific UI copy guided by the taste and anti-slop skills.

## Verification

Review representative discovery, ticket, form, and table pages at 320, 360, 768, and 1440px. Check keyboard focus, the contrast bar, 200% text scaling, reduced motion, long titles, dock clearance, and focus not obscured by the dock. Include an authentication page, where the dock is absent.

## Dependencies and scope

Build on existing authentication and routes. Restyle every current route, including administration, check-in, and certificates. This epic supplies patterns for Epics 11–13. It does not add event content, host management, or storage. Earlier Epic 02 light-theme instructions are superseded.
