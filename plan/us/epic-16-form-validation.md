# Epic 16 — Accessible form validation

**Status: Implemented.** Requested React Hook Form and Zod for all data-entry forms. This supersedes the earlier restriction on client JavaScript for forms.

## Scope

Login, signup, event creation/editing, host editing, cover/avatar uploads, certificate uploads, and participant search use React Hook Form and the Zod resolver. Forms with only an action button continue using native server actions.

## UX requirements

- Validate on first blur, then revalidate on changes. Submit validates all fields and focuses the first error.
- Keep explicit labels, autocomplete, helper text, native input types, and existing server feedback.
- Associate inline errors through `aria-describedby`, mark fields with `aria-invalid`, and announce errors with `role="alert"`.
- Keep incomplete forms submittable so users can discover errors. Disable submission during saving/uploading, with a specific pending label. Prevent duplicate submission by button and keyboard.
- Preserve returned values and clear passwords when server redirects return to the same form.
- Share event/auth/host schemas with server validation. Check file selection, MIME type, and size before uploading; server verification remains authoritative.
- Preserve certificate multipart submission to its existing endpoint and GET navigation for participant search.

## Verification

Typecheck and all 103 tests pass. Six DOM interaction/schema tests cover validation timing, accessible errors and focus, native FormData submission and pending feedback, duplicate prevention, file replacement after rejection, schedule/password limits, and resetting returned server values. Lint has only the four existing admin image warnings. Production build passes.

## Official examples

- [Accessibility](https://react-hook-form.com/advanced-usage#AccessibilityA11y)
- [Validation modes](https://react-hook-form.com/docs/useform#mode)
- [Zod resolver](https://github.com/react-hook-form/resolvers#zod)
