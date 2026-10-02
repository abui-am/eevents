import type { ZodError } from "zod";

export const AUTH_FIELDS = ["name", "email", "password"] as const;

export type AuthField = (typeof AUTH_FIELDS)[number];

const LOGIN_ERRORS: Record<string, string> = {
  credentials: "Email or password is incorrect.",
  "rate-limited": "Too many attempts. Wait a little while and try again.",
  unavailable: "We could not sign you in right now. Try again shortly.",
};

const SIGNUP_ERRORS: Record<string, string> = {
  unavailable: "Could not create an account with those details.",
};

export function safeAuthText(value: unknown, max: number): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

export function invalidAuthFields(error: ZodError): AuthField[] {
  const present = new Set<AuthField>();
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "name" || key === "email" || key === "password") present.add(key);
  }
  return AUTH_FIELDS.filter((field) => present.has(field));
}

export function passwordLengthIssue(error: ZodError): "short" | "long" | null {
  const issue = error.issues.find((item) => item.path[0] === "password");
  if (!issue) return null;
  return issue.code === "too_small" ? "short" : "long";
}

export function invalidAuthFieldSet(
  error: string | undefined,
  value: string | string[] | undefined,
): Set<AuthField> {
  if (error !== "invalid") return new Set();
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return new Set();
  const present = new Set(raw.split(",").map((item) => item.trim()));
  return new Set(AUTH_FIELDS.filter((field) => present.has(field)));
}

export function readPasswordIssue(
  error: string | undefined,
  value: string | string[] | undefined,
): "short" | "long" | null {
  if (error !== "invalid") return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "short" || raw === "long" ? raw : null;
}

export function authFailurePath(
  pathname: "/login" | "/signup",
  error: string,
  next: string | null,
  preserved: { name?: string; email?: string },
  invalid?: { fields: readonly AuthField[]; passwordIssue: "short" | "long" | null },
): string {
  const query = new URLSearchParams({ error });
  if (next) query.set("next", next);
  if (preserved.name) query.set("name", preserved.name);
  if (preserved.email) query.set("email", preserved.email);
  if (invalid && invalid.fields.length > 0) {
    query.set("fields", invalid.fields.join(","));
    if (invalid.fields.includes("password") && invalid.passwordIssue) {
      query.set("passwordIssue", invalid.passwordIssue);
    }
  }
  return `${pathname}?${query.toString()}`;
}

export function loginFormError(input: {
  error: string | undefined;
  fields: ReadonlySet<AuthField>;
  passwordIssue: "short" | "long" | null;
}): string | undefined {
  if (!input.error) return undefined;
  if (input.error === "invalid") {
    const parts: string[] = [];
    if (input.fields.has("email")) parts.push("Enter a valid email address.");
    if (input.fields.has("password")) {
      parts.push(
        input.passwordIssue === "long" ? "Use at most 72 characters." : "Enter your password.",
      );
    }
    return parts.join(" ") || "Enter a valid email and password to continue.";
  }
  return LOGIN_ERRORS[input.error];
}

export function signupFormError(input: {
  error: string | undefined;
  fields: ReadonlySet<AuthField>;
  passwordIssue: "short" | "long" | null;
}): string | undefined {
  if (!input.error) return undefined;
  if (input.error === "invalid") {
    const parts: string[] = [];
    if (input.fields.has("name")) parts.push("Enter your name using 1 to 100 characters.");
    if (input.fields.has("email")) parts.push("Enter a valid email address.");
    if (input.fields.has("password")) {
      parts.push(
        input.passwordIssue === "long"
          ? "Use at most 72 characters."
          : "Use at least 12 characters.",
      );
    }
    return parts.join(" ") || "Check your name, email, and password, then try again.";
  }
  return SIGNUP_ERRORS[input.error];
}

export function describedBy(
  errorId: string | undefined,
  invalidFields: ReadonlySet<AuthField>,
  field: AuthField,
  helpId?: string,
): string | undefined {
  const ids: string[] = [];
  const fieldIsInvalid = invalidFields.has(field);
  const formLevelError = Boolean(errorId) && invalidFields.size === 0;
  if (errorId && (fieldIsInvalid || formLevelError)) ids.push(errorId);
  if (helpId) ids.push(helpId);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
