import { ValidatedForm, ValidatedInput, SubmitButton } from "@/components/validated-form";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logIn } from "@app/actions/auth";
import { SiteHeader } from "@/components/site-header";
import {
  describedBy,
  invalidAuthFieldSet,
  loginFormError,
  readPasswordIssue,
  safeAuthText,
} from "@/lib/auth-form-feedback";
import { getUser } from "@/lib/auth";
import { safeLoginReturnPath } from "@/lib/redirects";

export const metadata: Metadata = { title: "Log in" };

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string | string[];
    email?: string | string[];
    fields?: string | string[];
    passwordIssue?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/my");

  const params = await searchParams;
  const next = await safeLoginReturnPath(params.next);
  const invalidFields = invalidAuthFieldSet(params.error, params.fields);
  const message = loginFormError({
    error: params.error,
    fields: invalidFields,
    passwordIssue: readPasswordIssue(params.error, params.passwordIssue),
  });
  const email = safeAuthText(params.email, 320);
  const notice =
    !message && params.notice === "account-created"
      ? "Your account is ready. Sign in to continue."
      : undefined;
  const focus = invalidFields.has("email")
    ? "email"
    : invalidFields.has("password") || params.error === "credentials" || email
      ? "password"
      : "email";

  return (
    <>
      <SiteHeader user={null} current="login" />
      <main id="main-content" tabIndex={-1} className="auth-shell">
        <section className="auth-card" aria-labelledby="login-title">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-title">Log in to eevents</h1>
          <p className="card-copy">
            Sign in to keep track of your event registrations and certificates.
          </p>

          {notice ? (
            <p className="form-message form-message-success" role="status">
              {notice}
            </p>
          ) : null}
          {message ? (
            <p className="form-message" id="login-error" role="alert">
              {message}
            </p>
          ) : null}

          <ValidatedForm schema="login" defaults={{ email, password: "" }} action={logIn} className="form-stack">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <div className="form-field">
              <label htmlFor="email">Email (required)</label>
              <ValidatedInput
                aria-describedby={describedBy(
                  message ? "login-error" : undefined,
                  invalidFields,
                  "email",
                )}
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
                aria-describedby={describedBy(
                  message ? "login-error" : undefined,
                  invalidFields,
                  "password",
                )}
                aria-invalid={invalidFields.has("password") ? true : undefined}
                autoComplete="current-password"
                autoFocus={focus === "password"}
                id="password"
                maxLength={72}
                name="password"
                required
                type="password"
              />
            </div>

            <SubmitButton className="button" pendingLabel="Signing in…">
              Log in
            </SubmitButton>
          </ValidatedForm>

          <p className="form-footer">
            New here?{" "}
            <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
              Create an account
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
