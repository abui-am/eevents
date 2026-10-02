# Epic 15 — Attendee glass and icons

**Status: Implemented; visual acceptance pending.** This file remains the requirement. Typecheck, all 97 tests, lint (four existing admin image warnings), and production build pass. Phone-width and reduced-transparency browser checks remain pending.

Reading this as a mobile-first glass pass for workshop attendees on the existing dark app. The screen has three depths. The first event stays on screen. No marketing site, no Tailwind, no client JavaScript.

## Outcome

Give attendee pages a frosted, layered surface that stays readable on a phone, using the existing type, routes, and Heroicons.

## Material system

Three tiers. Every `backdrop-filter` has a matching `-webkit-backdrop-filter`. The base rule is a solid fill. The blur is added only inside `@supports`. `prefers-reduced-transparency: reduce` removes every backdrop filter and uses the solid fill.

| Tier | Where | Fill | Blur | Edge |
| --- | --- | --- | --- | --- |
| Atmosphere | Fixed wash behind the page. Not a panel. | Two or three orbs, mint `#8ee8c8` and deep teal `#12352c`, on canvas `#101112` | `filter: blur(80px)` on the orbs. Not `backdrop-filter`. | None |
| Content | Discovery intro, event rows, My Events rows, the event registration panel | `rgb(32 34 35 / 72%)` on desktop, `rgb(32 34 35 / 84%)` below 768px | 12px desktop, 8px below 768px. `saturate(140%)` | 1px `rgb(255 255 255 / 18%)` |
| Navigation | The fixed mobile dock only | At least `rgb(16 17 18 / 88%)`. Raise it if text drops under 4.5:1 | 12px, not 20px. `saturate(140%)` | 1px `rgb(255 255 255 / 20%)` plus a faint top highlight |

Do not stack more than two `backdrop-filter` surfaces on screen at once. The dock is one. A content panel is the other. Orbs use `filter`, `pointer-events: none`, and `contain: paint`.

Shadows on glass panels may pick up a little mint. They stay soft. Do not use a violet or coral shadow.

Hover, where a panel is a link or holds a link, may lighten the edge to `rgb(255 255 255 / 32%)`. No brightness animation that requires JavaScript. `prefers-reduced-motion: reduce` freezes the orbs.

Text stays `#f3f4f4` and `#b7b9b8` on the glass fills above. Do not switch headings to white-on-clear or charcoal-on-light. Do not rely on `text-shadow` to pass contrast. Measure 4.5:1 against the lightest place an orb can sit behind the panel, and against white scrolling under the dock. TikTok Sans and Geist stay. Do not add Inter, Poppins, or DM Sans.

## Stories

### US-15.1 — Mark destinations and exits with one icon family

**As an attendee**, I want a glyph next to a destination or an external action so I can recognize it without losing the words.

**Acceptance criteria**

- Use `@heroicons/react` outline icons, one stroke weight, from server components. Do not add Phosphor, Lucide, `"use client"`, Tailwind, or a motion library.
- Dock and matching header links show a calendar for Events, a ticket for My events, and a shield for Admin. Each control keeps its text label. Not icon-only.
- Dock items stay at least 44px. Three items fit at 320px without a wrapping label or horizontal overflow.
- The Map link keeps the word “Map” and adds an external-link icon. A public host email keeps the address as the link text and adds an envelope icon.
- Icons that repeat the text are `aria-hidden`. The accessible name remains the text.
- Do not add icons to schedule lines, place lines, empty states, admin tables, status labels, or the QR plate. Do not put a calendar icon on the date panel.

### US-15.2 — Lay a luminous background under the glass

**As an attendee**, I want the page behind the panels to have color, so the frost is visible.

**Acceptance criteria**

- The atmosphere is canvas `#101112` plus at most three fixed orbs in mint and deep teal. No violet (`#4A00E0`), ocean blue, coral, gold, or rose gradient.
- Orbs may drift with a CSS animation longer than 20 seconds. Reduced motion sets them still.
- The first upcoming event remains visible on a 700px-tall phone without a new headline, subcopy, or call to action above the list.

### US-15.3 — Frost attendee panels and the dock

**As an attendee**, I want the list, the event action, and the dock to read as separate layers.

**Acceptance criteria**

- Apply the content tier to the discovery intro, event rows, My Events rows, and the event registration panel. Keep one obvious registration action. Do not add a features grid, a pricing table, or a new footer.
- Apply the navigation tier to the fixed dock. Do not fade the header from clear to glass on scroll. That behavior needs client JavaScript. Login and signup still do not render the dock.
- The ticket card and the QR plate stay solid. The plate stays white, the modules stay black, and the quiet zone stays clear.
- Login and signup fields may use an inset fill of `rgb(16 17 18 / 55%)` with an inner shadow, only if label and input text still meet 4.5:1. Otherwise leave those fields solid. Do not restyle admin inputs.
- Admin tables, check-in, and certificates stay on the solid dark system.

## Not in this epic

The glass prompt also asks for `GlassNavbar`, `Hero`, `Features`, `Pricing`, `GlassInput` as a kit, `Footer`, Framer Motion, Tailwind, a scroll-reactive navbar, `blur(20px)` on a full-width bar, and an 8% white fill. Those are a marketing page. This app already has discovery, event detail, My Events, and a ticket. Build the tiers onto those screens.

## References

- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials): glass is for navigation and controls. Reduce Transparency makes it more opaque.
- [CSS-Tricks, backdrop-filter](https://css-tricks.com/using-css-backdrop-filter-for-ui-effects/): blur needs a translucent fill. Start from a solid background.
- [PixCode, dark glass](https://pixcode.io/en/blog/css-glassmorphism-2025/): keep full-width mobile blur around 10–12px.
- [Mironsoft, frosted nav](https://www.mironsoft.de/en/blog/css-backdrop-filter-frosted-glass-effects): a viewport-wide bar past about 20px of blur is expensive on cheaper phones.
- [CodeFronts glass drawer](https://codefronts.com/navigation/css-mobile-navigation/glass-morphism-nav-drawer/): do not copy the animated purple blobs or a frosted card on every block.

## Verification

On a phone-width layout, confirm the first event is still visible, dock labels do not wrap at 320px, the bottom registration action stays above the dock, and the QR plate stays solid white. Confirm text contrast on a content panel over the brightest orb, and on the dock over white. Confirm reduced transparency removes the blur and reduced motion stops the orbs.

## Dependencies and scope

Follows Epic 08’s dock and type, and Epic 11’s attendee pages. Record the three tiers and the Heroicons family in [DESIGN.md](../../DESIGN.md).

## Implementation notes

- Discovery and My Events share one backdrop blur plane behind their content panels, rather than filtering each row separately. This keeps the list and dock to two backdrop surfaces.
- The static mint wash uses 24% opacity over the canvas, with deep teal as the second orb. A conservative saturation-adjusted contrast calculation gives secondary content text 6.57:1 on desktop and 7.22:1 on mobile; dock secondary text over white is 6.94:1.
- Auth fields stay solid. No motion, dependencies, or client JavaScript were added in this pass.
- Browser verification could not be completed: no browser connector was available, and native browser interaction was interrupted by user activity. The existing local preview also returned an error after the production build; restart the development server before visual acceptance.
