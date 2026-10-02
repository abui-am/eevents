"use server";

import "server-only";

import { redirect } from "next/navigation";
import { authenticateUser, createParticipantAccount } from "@/services/auth-service";
import {
  authFailurePath,
  invalidAuthFields,
  passwordLengthIssue,
  safeAuthText,
} from "@/lib/auth-form-feedback";
import { endSession, startSession } from "@/lib/auth";
import { safeLoginReturnPath } from "@/lib/redirects";
import { loginSchema, signupSchema } from "@/lib/validation";

export async function signUp(formData: FormData): Promise<void> {
  const requestedNext = await safeLoginReturnPath(formData.get("next"));
  const name = safeAuthText(formData.get("name"), 100);
  const email = safeAuthText(formData.get("email"), 320);
  const input = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!input.success) {
    redirect(
      authFailurePath("/signup", "invalid", requestedNext, { name, email }, {
        fields: invalidAuthFields(input.error),
        passwordIssue: passwordLengthIssue(input.error),
      }),
    );
  }

  const result = await createParticipantAccount(input.data);
  if (result.kind === "created") {
    const query = new URLSearchParams({
      notice: "account-created",
      email: input.data.email,
    });
    if (requestedNext) query.set("next", requestedNext);
    redirect(`/login?${query.toString()}`);
  }

  redirect(
    authFailurePath("/signup", "unavailable", requestedNext, {
      name: input.data.name,
      email: input.data.email,
    }),
  );
}

export async function logIn(formData: FormData): Promise<void> {
  const requestedNext = await safeLoginReturnPath(formData.get("next"));
  const email = safeAuthText(formData.get("email"), 320);
  const input = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!input.success) {
    redirect(
      authFailurePath("/login", "invalid", requestedNext, { email }, {
        fields: invalidAuthFields(input.error),
        passwordIssue: passwordLengthIssue(input.error),
      }),
    );
  }

  const preserved = { email: input.data.email };
  const result = await authenticateUser(input.data);
  if (result.kind === "invalid") {
    redirect(authFailurePath("/login", "credentials", requestedNext, preserved));
  }
  if (result.kind === "rate-limited") {
    redirect(authFailurePath("/login", "rate-limited", requestedNext, preserved));
  }
  if (result.kind === "unavailable") {
    redirect(authFailurePath("/login", "unavailable", requestedNext, preserved));
  }

  try {
    await startSession(result.userId);
  } catch {
    console.error("Session creation failed during sign-in.");
    redirect(authFailurePath("/login", "unavailable", requestedNext, preserved));
  }

  redirect(requestedNext ?? (result.role === "ADMIN" ? "/admin" : "/my"));
}

export async function logOut(_formData: FormData): Promise<void> {
  void _formData;
  await endSession();
  redirect("/");
}
