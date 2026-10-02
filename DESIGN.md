# UI/UX Design Guidelines

## Direction and authority

Design for small organizations running workshops and training, and for participants reserving places and collecting attendance certificates. The interface is dark by default on every public, participant, authentication, and administrator route. It should feel calm and easy to scan: charcoal panels on a near-black canvas, off-white text, one light primary action, and mint used only for success.

Use Luma as a reference for hierarchy and event-focused composition, not as a brand to copy. Keep this application's identity, copy, and routes. Missing artwork stays a designed date panel. Do not invent hosts, cover images, guest lists, or attendance claims.

These guidelines cover discovery, event details, authentication, My Events, tickets, certificates, and administrator operations. [Accepted decisions](plan/decisions.md) govern behavior. [Epic 08](plan/us/epic-08-dark-design-system.md) is the visual contract. Light-theme instructions from Epic 02 are retired. This document specifies the interface; it is not evidence that a browser pass has been completed.

## Typography

- **TikTok Sans:** page headings, event titles, and date numerals. Weight 600; weight 700 only for the main event title. Self-hosted from the files already in `app/globals.css`.
- **Geist Sans:** body, navigation, labels, controls, notices, and administrative data. Weight 400 for body, 500 for labels and buttons, 600 for emphasis. Geist Mono is not part of this system.
- Supporting text is 14px with a unitless line-height near 1.43. Body and inputs are 16px / 1.5. Section headings are 20px / 1.4. Page titles are 28px / 1.21 on small screens and 36px / 1.17 from 768px. Event titles are 36px / 1.17 and 48px / 1.13.
- Keep body copy within about 65 characters. Titles wrap. Do not truncate an event title, force a decorative line break, or use all-caps labels or letterspacing as decoration.
- Font stacks are `"TikTok Sans", system-ui, sans-serif` and `"Geist", system-ui, sans-serif`. `font-display: swap` keeps text readable while the files load. Sources: [TikTok Sans](https://github.com/tiktok/TikTokSans) and [Geist](https://vercel.com/font).

## Color and surfaces

Dark mode is the only theme. Tokens live on `:root` in `app/globals.css`. A token is final only when the pairs below meet WCAG 2.2 AA: text at least 4.5:1, large text and non-text UI at least 3:1. Ratios were calculated with the WCAG relative-luminance formula.

| Token | Hex | Role |
| --- | --- | --- |
| `--color-canvas` | `#101112` | Page background |
| `--color-surface` | `#202223` | Panels, cards, dock |
| `--color-surface-muted` | `#2a2c2d` | Date tiles, quiet fills, neutral status |
| `--color-surface-raised` | `#323536` | Pressed secondary controls, current dock item |
| `--color-text` | `#f3f4f4` | Primary text and inline links |
| `--color-text-secondary` | `#b7b9b8` | Meta, hints, inactive dock labels |
| `--color-border` | `#7e7e7e` | Panel and dock edges |
| `--color-control-border` | `#8e9190` | Inputs, secondary buttons, selected filters |
| `--color-primary` | `#f4f5f4` | Light fill for the primary action |
| `--color-primary-hover` | `#d9dcda` | Primary hover fill |
| `--color-primary-pressed` | `#c5c9c6` | Primary pressed fill |
| `--color-on-primary` | `#101112` | Label on a primary action |
| `--color-focus` | `#f4f5f4` | 2px focus ring, 3px outside the control |
| `--color-success` | `#8ee8c8` | Success text only |
| `--color-info` | `#a7c7ff` | Confirmed and information text |
| `--color-info-surface` | `#172a46` | Confirmed badge fill |
| `--color-success-surface` | `#12352c` | Success notice and badge fill |
| `--color-warning` | `#f0c36a` | Warning text |
| `--color-warning-surface` | `#3a2c12` | Warning notice fill |
| `--color-danger` | `#ffb4b0` | Error text and the danger-button edge |
| `--color-danger-surface` | `#3c1c1e` | Error notice fill |
| `--color-danger-fill` | `#c0363a` | Danger button fill |
| `--color-danger-fill-hover` | `#a12d32` | Danger hover fill |
| `--color-danger-fill-pressed` | `#8f2d32` | Danger pressed fill |
| `--color-on-danger` | `#f3f4f4` | Label on a danger button |
| `--color-neutral-surface` | `#2a2c2d` | Neutral status fill |

Measured pairs that authorize these tokens:

- Text `#f3f4f4` on canvas 17.15, surface 14.50, muted 12.73, raised 11.22.
- Secondary `#b7b9b8` on canvas 9.58, surface 8.10, muted 7.11, raised 6.27, success surface 6.77, warning surface 6.87, danger surface 7.73.
- Primary label `#101112` on `#f4f5f4` 17.30, hover `#d9dcda` 13.68, pressed `#c5c9c6` 11.29. Those fills against canvas are 17.30, 13.68, and 11.29, and against charcoal 14.62, 11.56, and 9.54.
- Focus `#f4f5f4` against canvas 17.30, charcoal 14.62, muted 12.84, and raised 11.31. The ring is offset 3px, so it is judged against the surface behind it, not against a light button fill.
- Panel border `#7e7e7e` against canvas 4.66, charcoal 3.94, muted 3.46, raised 3.05. Control border `#8e9190` against canvas 5.94, charcoal 5.02, muted 4.41, raised 3.89.
- Success `#8ee8c8` on `#12352c` 9.24, and on canvas 13.08. Warning `#f0c36a` on `#3a2c12` 8.21. Danger text `#ffb4b0` on `#3c1c1e` 9.01.
- Danger label `#f3f4f4` on fill `#c0363a` 4.98, hover `#a12d32` 6.49, pressed `#8f2d32` 7.36. The fill against charcoal is 2.91:1, so the `#ffb4b0` border (9.44:1 on charcoal, 3.24:1 on the fill) is the control boundary. Keep that border on hover and pressed states.
- QR modules stay `#000` on a `#fff` plate, 21:1. That plate is for scanning. It is not a theme surface.

Charcoal on the canvas is only 1.18:1, so panels, inputs, and the dock use the borders above to stay identifiable. Mint and green are success. They are not link colors, eyebrows, date numerals, selected filters, or the primary button.

## Layout, spacing, and responsiveness

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, and 64px. Panel padding is 16px, then 24px from 768px. Major sections separate by 32–48px.
- Content is centered at 1120px. Gutters are 16px below 768px, 24px from 768px, and 32px from 1024px. Authentication forms max out at 420px.
- Below 1024px, event detail is one column. From 1024px, the main column sits beside a 320px registration column with 32px between them, in normal flow.
- Controls use 12px corners. Panels and the mobile dock use 16px. Statuses use pills. Prefer the border token over elevation. The dock may use one soft shadow so it separates from scrolling content.
- Below 768px, a fixed dock shows Events, My events when someone is signed in, and Admin only for an administrator. The header keeps the wordmark and the account actions: the person's name and Sign out, or Log in and Sign up. At 768px and up the dock is hidden and those destinations return to the compact header. Login and signup never render the dock.
- Labels stay sentence case. The current destination sets `aria-current="page"` and an underline, not color alone. There is no chat or notification destination.
- The dock sits 12px above the bottom safe area, with 16px side insets. Pages that include it add bottom padding and `scroll-padding-bottom` of the dock offset, bar, a 24px gap, and `env(safe-area-inset-bottom)`, so content and a focused control can scroll clear of the dock. The viewport uses `viewport-fit: cover`.
- Attendee glass has three tiers: a fixed mint/deep-teal wash blurred 80px, content fills at 72% charcoal (84% below 768px) with 12px blur (8px mobile), and the mobile dock at 88% charcoal with 12px blur and a 20% white edge. Discovery intro and rows, My Events rows, and the event registration panel use content glass. Lists share one blur plane, so content and dock use at most two backdrop filters. The wash is static and capped at 24% mint to preserve text contrast. Solid fills precede feature detection; reduced transparency removes blur and restores solid surfaces. Tickets, QR plates, auth fields, admin, check-in, and certificates stay solid.
- Destination links use Heroicons outline: calendar for Events, ticket for My events, shield for Admin. The map link adds an external-link glyph and the host email adds an envelope. The words stay. Icons are `aria-hidden`.
- Below 1024px the event's registration action remains where the current page already places it. Repeating that action is Epic 11's job, not this system's.
- Native links navigate. Buttons submit. Long names, emails, and titles wrap without a page-level horizontal scrollbar. The account name in the header may ellipsize so Sign out stays reachable.

## Shared components and interaction

**Actions.** Short labels stay together, and longer labels wrap at words with automatic control height. Never ellipsize a button or break its words into single characters. Inputs shrink before submit controls; narrow search forms stack. Pending labels remain readable. Each workflow has one obvious primary action: light fill, dark label, at least 48px tall on the shared `.button` and at least 44px everywhere else a primary is required. Header Sign up uses the compact primary button. Secondary actions use the charcoal surface, light label, and control border. Destructive actions use the danger fill, light label, and danger border, with an explicit verb. Dock items are at least 44px. Ordinary controls are at least 24px; standalone back and pagination links are 44px. Inline links in prose are underlined. Unavailable actions keep nearby explanations. Disabled controls use secondary text on the muted surface (7.11:1) and `not-allowed`.

**Navigation.** The skip link is first. Header and dock each expose one "Main" navigation; CSS hides the one that does not apply, so only one is in the tab order. Account navigation stays separate and still signs people out. Login return paths stay server-owned.

**Forms.** Labels sit above fields. Placeholders are examples, not labels. Required fields say so. Constraints appear before submit. Help and errors that already point at a field keep that connection. Invalid fields use the danger border (11.17:1 on the canvas input). Entered values stay when the page can do so safely. Several failures use one alert plus a specific correction. Authentication fields allow password managers and paste.

**Feedback.** Notices stay on the page. They are not toasts. Success, warning, and danger each pair text with a surface from the table above. A neutral notice is for mixed results that are not one of those states. A successful application says “Application received. Place reserved. Your QR is ready for onsite confirmation.” Failures say what happened and what to do next, without internal errors. Loading views keep the page structure and real text.

**Confirmation.** Cancellation and certificate replacement stay server-rendered. Name the event or participant, state the consequence, and offer a safe return. Event cancellation says it is final and that registration and certificate records remain.

**Pagination.** Previous and next are native links, with a current-page indicator and URL state. Discovery and admin lists show 20 records. Status filters show counts and `aria-current` for the selected filter. The selected filter is underlined text, not a success color.

**Motion.** Color and border feedback may transition for 120–180ms. `prefers-reduced-motion: reduce` removes that motion and smooth scrolling. Client JavaScript supports React Hook Form with Zod on data-entry forms and the shared viewer-timezone presentation. Badge and Button use locally owned shadcn/ui patterns adapted to plain CSS and the project tokens.

## Screen patterns

### Discovery and event detail

Discovery lists upcoming published events with a date panel, title, viewer-local schedule, location, and availability. The entire artwork, title, facts, and availability row is one native link to the event, with an accessible name from the title, full-row focus, and hover feedback. Empty copy: “No upcoming events yet,” with a useful next step. Drafts and cancelled events stay off this list.

Event detail leads with the title, full viewer-local date and time, location, then the description. The registration panel states availability and the fitting action, “Sign in to apply” or “Apply to attend,” and explains that an application issues a ticket for onsite confirmation. Public details stay available before login, and authentication returns to the requested event. “Event full,” “Registration closed,” and cancellation are sentences, not a bare disabled button. Cancellation notices and last-updated timestamps stay on direct links.

### Authentication and My Events

Sign-in and sign-up are short single-column forms with a link to the other account page. No marketing block and no role picker. These routes have no dock.

My Events keeps each registration's viewer-local schedule, status, action, and certificate state together, including event updates and cancellations. Empty copy: “You haven't registered for an event yet,” then a way back to events.

### Administrator operations

Use the same type and surfaces, packed more tightly. The overview shows a 96px uploaded cover thumbnail (localized date tile when absent), title, lifecycle, viewer-local schedule, registration count against capacity, and a management link. “Create event” is the light primary. Edit forms group details, schedule, capacity, and lifecycle, and they explain locked schedules and rejected capacity changes. Schedule fields default to the device timezone and expose an explicit UTC option. Show the selected timezone beside the fields; validate and convert local input server-side. Preserve the timezone and entered values after errors, and preserve unchanged instants on edits. Reject skipped or ambiguous daylight-saving input with corrective feedback.

Participant views are tables from 1024px and labeled stacked records below that, with name, email, registration time, status, arrival, and certificate state. Contact details stay inside authorized admin views. Filters show counts. Row actions are secondary or danger, not a second primary. Manual check-in is the existing event-scoped search. No bulk actions and no invitations.

### Tickets and onsite scans

Tickets appear after application. Keep the existing layout and black-on-white QR plate. Explain two scans: arrival confirms attendance; a second scan after the scheduled end verifies the participant stayed and issues the certificate. Ticket QR access remains private and extends through the final-scan window.

Administrators explicitly start the camera. A valid decoded ticket submits automatically, with pending status, a specific success or error message, and a retry path. Camera streams stop on navigation or close. The protected built-in-camera landing page submits the same authenticated POST action; GET stays read-only. Show original timestamps for duplicate scans. Arrival-only undo is removed.

Arrival has no opening or closing time restriction. Final verification opens at end with no closing deadline, requiring an earlier arrival. Explain closed windows and missing arrival in text. Use the participant’s name and event in the protected result; keep “View certificate” available after successful final verification.

### Certificates

New certificates are generated HTML; remove upload/replacement forms. Before issuance, explain the missing arrival or final verification and show when final verification opens. Participant/admin links say “View certificate”; existing private PDF downloads remain available.

The public certificate is a self-contained, solid ivory print document with dark text, a restrained border, centered certificate title and recipient, event schedule, issuer and certificate identifier. Use system serif typography, responsive spacing and wrapping, and A4 landscape print CSS. No navigation dock, external resources or scripts. Include browser-print guidance and explain that the link can be kept and shared. Freeze contents at issuance.

## Status language and eligibility

- `REGISTERED`: “Awaiting confirmation”; the place is reserved.
- `CONFIRMED`: “Confirmed”; confirmation is not attendance.
- `ATTENDED`: “Attended”; certificate availability is separate.
- `NO_SHOW`: “No-show”; neutral text, not punitive decoration.
- Participant `CANCELLED`: “You cancelled”; “Register again” only before the start, while published, with capacity left.
- Administrator `CANCELLED`: “Registration declined”; only an administrator can reopen it, and only while event, time, and capacity rules allow.
- Event lifecycle: “Draft,” “Published,” and “Cancelled.” Event cancellation is not registration cancellation.

Participants may cancel a registered or confirmed place only before the start. Arrival scans record attendance at any time; no-show can be recorded after end. Timing limits sit next to unavailable actions. Every event time and update stamp uses the viewer’s device timezone and carries an explicit zone label, for example “12 Oct 2026, 17:00–19:00 Asia/Makassar (UTC+08:00).” Server-rendered output and unavailable detection use a clearly labeled UTC fallback. Date tiles use the same local calendar date. The shared provider reads the configured browser timezone without requesting location. UTC remains the stored timestamp and the basis of eligibility checks. The interface does not replace server authorization.

Status badges use the shared Badge component: awaiting confirmation is amber, confirmed is blue information, attended/published is mint success, cancelled/declined is rose danger, and draft/no-show is neutral. Blue information text `#a7c7ff` on `#172a46` has 8.42:1 contrast. Success, information, warning, danger, and neutral colors follow the token table. The words above are required even when the color is also present.

## Accessibility and acceptance checklist

Target [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/). This list is the review guide, not a conformance claim.

- Text at least 4.5:1, or 3:1 for qualifying large text. Non-text boundaries and states at least 3:1, using the pairs in the color section, including hover, pressed, and status treatments.
- Landmarks, a skip link, one page heading, visible labels, and accessible names. Focus is a 2px ring, 3px outside the control, and it must not sit fully under the dock.
- Every task works from the keyboard. Reading order follows the document. Status and errors use text as well as color.
- Review 320, 360, 768, and 1440px, plus 200% text and reduced motion. Long titles, emails, descriptions, and labels wrap without clipping or a horizontal page scrollbar.
- Review full, closed, cancelled, awaiting-confirmation, declined, empty, validation, upload-failure, and certificate-unavailable states.
- Review ticket pending, issued, revoked, expired, too-early, already-checked-in, manual, and undo states. The QR stays legible. Arrival records attendance; certificate eligibility also requires a final onsite scan.
- Authentication pages have no dock. Other small-screen routes do, and only for destinations the account may use.
- Fonts fall back to `system-ui`. Reduced motion removes nonessential transitions.

Do not add product features to chase a visual reference. Event artwork, hosts, venue fields, and the ticket redesign belong to later epics.

## Form validation and submission

Data-entry forms use React Hook Form with the Zod resolver. Validate on first blur (`onTouched`), then update errors as the field changes. Submitting validates every field and focuses the first invalid input. Associate each inline error with its field using `aria-describedby`, set `aria-invalid`, and announce the error with `role="alert"`. Keep labels, autocomplete, input types, helper text, and existing server errors. Do not disable submit merely because the form is incomplete.

Server-action submit buttons disable only while the action is pending and show a specific progress label. Client validation hands valid submissions to React's native form-action lifecycle, retaining server redirects and server-side validation/authorization. Image and PDF uploads validate selection, MIME type, and size locally; content verification stays on the server. New certificates use the final onsite scan rather than upload forms; participant search retains GET navigation. Forms without editable fields continue using native server actions.

References: [React Hook Form accessibility example](https://react-hook-form.com/advanced-usage#AccessibilityA11y), [validation modes](https://react-hook-form.com/docs/useform#mode), [Zod resolver](https://github.com/react-hook-form/resolvers#zod).
## Registration questionnaire screens

Epic 17 follows the project-local ui-ux-pro-max guidance with this existing design system. Keep administrator panels solid charcoal, inputs on the canvas, off-white primary actions, and existing TikTok Sans/Geist typography. No additional UI framework, fonts, or palette are introduced.

The question editor is an ordered list with labeled move up/down and remove controls, question/type fields, optional helper text, required settings, and contextual option rows. Distinguish unsaved changes, saved unpublished drafts, and published versions. Explain that publication changes future applications and preserve explicit Save draft, Preview saved draft, and Publish questions actions.

Application forms are a single column up to 720px. Native radio and checkbox groups use fieldset/legend; text fields use labels. Show required/optional state, persistent helper text, inline errors linked by aria-describedby, and pending submission labels. Preserve entered values after server failure or a version refresh. Focus the first invalid field, following the accepted form behavior.

Answer filters appear above participant records with question, condition, and conditional value inputs; active criteria wrap into removable chips. Historical options/questions are labeled in text. Review pages show original question wording and read-only answers, with Not answered distinct from No. Wrap long labels and answers, use 44px controls, and keep mobile content/focus clear of the dock.

### Questionnaire editor

Keep the questionnaire composer centered at a maximum 880px. Each question has a dedicated drag grip immediately before the question number and a named delete icon button; omit the position selector as requested. Keyboard users lift with Space, move with arrows, and drop with Space; Escape cancels. Keep question text and answer-type fields aligned at their top edges even when one field has validation feedback. Stack fields on narrow screens. Put the required control in a quiet footer; retain visible labels, errors, question identities, and complete option data when sorting. Locked or pending questionnaires disable edits and sorting. Respect reduced motion.
