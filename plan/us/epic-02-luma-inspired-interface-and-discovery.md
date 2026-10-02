# Epic 02 — Luma-inspired interface and event discovery

> **Supersession note:** The [dark redesign roadmap](../dark-luma-redesign.md) and Epics 08–14 supersede this epic’s light theme and exclusions of cover uploads, host profiles, and venue map links. The original text below is retained as historical scope. Registration, privacy, and authorization rules remain applicable.

## Outcome

Give participants a clear, polished event-discovery and event-detail experience inspired by Luma’s public interface while preserving this app’s domain, stack, and privacy rules.

Luma’s documented event page pairs prominent event imagery and host information with a large title, date, location, registration panel, and event description. This app has no accepted cover-image or host-profile feature, so it should use a designed event-summary/date panel rather than fabricated imagery. See [Luma’s event creation guide](https://help.luma.com/p/creating-an-event) and [registration flow](https://help.luma.com/p/event-registration-process).

## Stories

### US-02.1 — Establish shared visual and accessible patterns

**As a visitor or participant**, I want a consistent interface so common actions and event details are easy to find.

**Acceptance criteria**

- Follow the shared [UI/UX design guidelines](../../DESIGN.md): light, soft neutral surfaces, dark readable type, restrained green primary actions, subtle borders, and rounded panels. Use TikTok Sans for headings and event titles, and Geist Sans for body text, forms, navigation, and administrative data, with system sans-serif fallbacks.
- Use consistent spacing, clear heading hierarchy, generous event-detail layout, and a single obvious primary action per page.
- Provide shared navigation, buttons, status text, notices, labeled forms, visible keyboard focus, semantic landmarks, and empty/error states.
- Preserve WCAG-conscious contrast; never rely on color alone. Support mobile, tablet, and desktop without horizontal overflow.
- Use plain CSS, server-rendered content, native forms and links, and no custom client JavaScript or new UI framework.
- Do not use Luma logos, copy, or branded assets. Do not create an event-image upload feature as part of visual imitation.

### US-02.2 — Browse published events

**As a visitor**, I want to browse upcoming published events so I can find a relevant workshop or training session.

**Acceptance criteria**

- Show title, UTC schedule, location, and registration availability in readable event summaries.
- Hide drafts and omit cancelled events from the general available-event list; keep participant and administrator details private.
- Paginate using URL state with 20 events per page and provide an empty state with a clear next action.

### US-02.3 — Read an event page and understand its action

**As a visitor or participant**, I want a clear event page so I understand what the event is and whether I can register.

**Acceptance criteria**

- On wide screens, pair a compact visual event summary/date treatment with the main title, UTC date and time, location, registration panel, and description; stack sections on narrow screens.
- Use a prominent application action and clear capacity, full, closed, awaiting-confirmation, and confirmed states. Pending applicants have a reserved place but no ticket until administrator confirmation.
- Show cancelled-event notice and last-updated time where applicable; the page is readable from a direct link.
- Allow public event discovery and details without login. Require login only at registration, then return the participant to that event using a safe local return path.
- Do not show attendee contact information publicly.

## Dependencies

US-02.1 depends on US-01.1 and supplies the patterns for the rest of the interface. US-02.2 and US-02.3 depend on event and account data from Epic 01.

## Not included

Public guest lists, maps, cover uploads, search ranking, social discovery, event themes, paid tickets, calendars, and email blasts. These are Luma capabilities or possible future ideas, not accepted requirements.
