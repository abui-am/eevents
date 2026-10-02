import { ValidatedForm, ValidatedInput, SubmitButton } from "@/components/validated-form";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@app/actions/auth";
import { SiteHeader } from "@/components/site-header";
import {
  describedBy,
  invalidAuthFieldSet,
  readPasswordIssue,
  safeAuthText,
  signupFormError,
} from "@/lib/auth-form-feedback";
import { getUser } from "@/lib/auth";
import { safeLoginReturnPath } from "@/lib/redirects";

export const metadata: Metadata = { title: "Create an account" };

type SignupPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string | string[];
    name?: string | string[];
    email?: string | string[];
    fields?: string | string[];
    passwordIssue?: string | string[];
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const user = await getUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/my");

  const params = await searchParams;
  const next = await safeLoginReturnPath(params.next);
  const invalidFields = invalidAuthFieldSet(params.error, params.fields);
  const message = signupFormError({
    error: params.error,
    fields: invalidFields,
    passwordIssue: readPasswordIssue(params.error, params.passwordIssue),
  });
  const name = safeAuthText(params.name, 100);
  const email = safeAuthText(params.email, 320);
  const errorId = message ? "signup-error" : undefined;
  const focus = invalidFields.has("name")
    ? "name"
    : invalidFields.has("email")
      ? "email"
      : invalidFields.has("password")
        ? "password"
        : "name";

  return (
    <>
      <SiteHeader user={null} current="signup" />
      <main id="main-content" tabIndex={-1} className="auth-shell">
        <section className="auth-card" aria-labelledby="signup-title">
          <p className="eyebrow">Your events, all together</p>
          <h1 id="signup-title">Create your account</h1>
          <p className="card-copy">
            Join events and access your learning certificates from one place.
          </p>

          {message ? (
            <p className="form-message" id="signup-error" role="alert">
              {message}
            </p>
          ) : null}

          <ValidatedForm schema="signup" defaults={{ name, email, password: "" }} action={signUp} className="form-stack">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <div className="form-field">
              <label htmlFor="name">Name (required)</label>
              <ValidatedInput
                aria-describedby={describedBy(errorId, invalidFields, "name")}
                aria-invalid={invalidFields.has("name") ? true : undefined}
                autoComplete="name"
                autoFocus={focus === "name"}
                defaultValue={name}
                id="name"
                maxLength={100}
                name="name"
                required
                type="text"
              />
            </div>

            <div className="form-field">
              <label htmlFor="email">Email (required)</label>
              <ValidatedInput
                aria-describedby={describedBy(errorId, invalidFields, "email")}
                aria-invalid={invalidFields.has("email") ? true : undefined}
                autoComplete="email"
                autoFocus={focus === "email"}
                defaultValue={email}
                id="email"
                maxLength={320}
                name="email"
                required
                type="email"
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password (required)</label>
              <ValidatedInput
                aria-describedby={describedBy(errorId, invalidFields, "password", "password-help")}
                aria-invalid={invalidFields.has("password") ? true : undefined}
                autoComplete="new-password"
                autoFocus={focus === "password"}
                id="password"
                maxLength={72}
                minLength={12}
                name="password"
                required
                type="password"
              />
              <p className="field-help" id="password-help">Use at least 12 characters.</p>
            </div>

            <SubmitButton className="button" pendingLabel="Creating account…">
              Create account
            </SubmitButton>
          </ValidatedForm>

          <p className="form-footer">
            Already have an account?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
              Log in
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
