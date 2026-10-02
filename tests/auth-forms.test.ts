import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { logIn, signUp } from "@app/actions/auth";
import LoginPage from "@app/login/page";
import SignupPage from "@app/signup/page";
import { createTestEvent, createTestUser } from "./support/database";

const PASSWORD = "correct-horse-battery-41";

async function redirectDestination(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    expect(error).toMatchObject({ code: "TEST_REDIRECT" });
    return (error as { destination: string }).destination;
  }
  throw new Error("Expected a redirect.");
}

function inputTag(markup: string, id: string): string {
  return markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
}

it("returns the signup email and name with a specific error and drops the password", async () => {
  const admin = await createTestUser({ role: "ADMIN" });
  const event = await createTestEvent(admin.id, {
    slug: "return-workshop",
    status: "PUBLISHED",
  });
  const formData = new FormData();
  formData.set("name", "Ada Example");
  formData.set("email", "ada@example.test");
  formData.set("password", "tiny-pass");
  formData.set("next", `/events/${event.slug}`);

  const destination = await redirectDestination(signUp(formData));
  const url = new URL(destination, "http://localhost");

  expect(url.pathname).toBe("/signup");
  expect(url.searchParams.get("error")).toBe("invalid");
  expect(url.searchParams.get("name")).toBe("Ada Example");
  expect(url.searchParams.get("email")).toBe("ada@example.test");
  expect(url.searchParams.get("fields")).toBe("password");
  expect(url.searchParams.get("passwordIssue")).toBe("short");
  expect(url.searchParams.get("next")).toBe(`/events/${event.slug}`);
  expect(url.searchParams.has("password")).toBe(false);
  expect(destination).not.toContain("tiny-pass");

  const markup = renderToStaticMarkup(
    await SignupPage({
      searchParams: Promise.resolve({
        error: "invalid",
        name: "Ada Example",
        email: "ada@example.test",
        fields: "password",
        passwordIssue: "short",
        next: `/events/${event.slug}`,
      }),
    }),
  );

  expect(markup).toContain("Use at least 12 characters.");
  expect(markup).not.toContain("site-dock");
  expect(inputTag(markup, "name")).toContain('value="Ada Example"');
  expect(inputTag(markup, "email")).toContain('value="ada@example.test"');
  expect(inputTag(markup, "password")).toContain('aria-invalid="true"');
  expect(inputTag(markup, "password")).toContain("signup-error");
  expect(inputTag(markup, "password")).not.toContain("value=");
  expect(markup).toContain(`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`);
  expect(markup).toContain('type="submit"');
});

it("keeps a rejected login email, names the email error, and hides the dock", async () => {
  const formData = new FormData();
  formData.set("email", "not-an-email");
  formData.set("password", PASSWORD);
  formData.set("next", "https://attacker.example/collect");

  const destination = await redirectDestination(logIn(formData));
  const url = new URL(destination, "http://localhost");

  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("error")).toBe("invalid");
  expect(url.searchParams.get("email")).toBe("not-an-email");
  expect(url.searchParams.get("fields")).toBe("email");
  expect(url.searchParams.get("next")).toBeNull();
  expect(url.searchParams.has("password")).toBe(false);
  expect(destination).not.toContain(PASSWORD);

  const markup = renderToStaticMarkup(
    await LoginPage({
      searchParams: Promise.resolve({
        error: "invalid",
        email: "not-an-email",
        fields: "email",
      }),
    }),
  );

  expect(markup).toContain("Enter a valid email address.");
  expect(markup).not.toContain("site-dock");
  expect(markup).not.toContain(PASSWORD);
  expect(inputTag(markup, "email")).toContain('value="not-an-email"');
  expect(inputTag(markup, "email")).toContain('aria-invalid="true"');
  expect(inputTag(markup, "email")).toContain('aria-describedby="login-error"');
  expect(inputTag(markup, "password")).not.toContain("aria-invalid");
  expect(inputTag(markup, "password")).not.toContain("value=");
  expect(markup).toMatch(/<button[^>]*data-slot="button"[^>]*type="submit"/);
});

it("preserves a normalized email after a wrong password and asks for another try", async () => {
  const formData = new FormData();
  formData.set("email", "Ada-Credential@Example.test");
  formData.set("password", PASSWORD);

  const destination = await redirectDestination(logIn(formData));
  const url = new URL(destination, "http://localhost");

  expect(url.searchParams.get("error")).toBe("credentials");
  expect(url.searchParams.get("email")).toBe("ada-credential@example.test");
  expect(url.searchParams.has("password")).toBe(false);
  expect(url.searchParams.has("fields")).toBe(false);
  expect(destination).not.toContain(PASSWORD);

  const markup = renderToStaticMarkup(
    await LoginPage({
      searchParams: Promise.resolve({
        error: "credentials",
        email: "ada-credential@example.test",
      }),
    }),
  );

  expect(markup).toContain("Email or password is incorrect.");
  expect(inputTag(markup, "email")).toContain('value="ada-credential@example.test"');
  expect(inputTag(markup, "email")).not.toContain("aria-invalid");
  expect(inputTag(markup, "password")).toContain('aria-describedby="login-error"');
  expect(inputTag(markup, "password")).toContain("autofocus");
});
