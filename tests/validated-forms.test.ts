// @vitest-environment jsdom
import { createElement as h, Fragment, act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ValidatedForm, ValidatedInput, SubmitButton } from "@/components/validated-form";
import { formSchemas } from "@/lib/form-schemas";

afterEach(cleanup);

function loginForm(action: (data: FormData) => Promise<void>, defaults = { email: "", password: "" }) {
  return h(ValidatedForm, {
    action, schema: "login", defaults,
    children: h(Fragment, null,
      h("label", { htmlFor: "email" }, "Email"),
      h(ValidatedInput, { id: "email", name: "email", type: "email", required: true }),
      h("label", { htmlFor: "password" }, "Password"),
      h(ValidatedInput, { id: "password", name: "password", type: "password", required: true }),
      h("input", { type: "hidden", name: "next", value: "/my" }),
      h(SubmitButton, { pendingLabel: "Signing in…", children: "Log in" }),
    ),
  });
}

function login(action: (data: FormData) => Promise<void>) {
  return render(loginForm(action));
}

it("waits for first blur, announces the field error, and clears it on correction", async () => {
  const user = userEvent.setup();
  login(vi.fn());
  const email = screen.getByLabelText("Email");
  await user.type(email, "invalid");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.tab();
  expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(email.getAttribute("aria-describedby")).toBe("email-field-error");
  await user.clear(email);
  await user.type(email, "ada@example.test");
  await waitFor(() => expect(screen.queryByText("Enter a valid email address.")).toBeNull());
});

it("blocks invalid submission and focuses the first invalid field", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  login(action);
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  expect(action).not.toHaveBeenCalled();
});

it("submits native FormData once, retains hidden fields, and disables submit while pending", async () => {
  const user = userEvent.setup();
  let finish: (() => void) | undefined;
  const action = vi.fn(async (data: FormData) => { expect(data.get("email")).toBe("ada@example.test"); await new Promise<void>((resolve) => { finish = resolve; }); });
  login(action);
  await user.type(screen.getByLabelText("Email"), "ada@example.test");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const data = action.mock.calls[0][0];
  expect(data.get("email")).toBe("ada@example.test");
  expect(data.get("password")).toBe("correct-horse-battery");
  expect(data.get("next")).toBe("/my");
  const pending = screen.getByRole("button", { name: "Signing in…" });
  expect(pending.hasAttribute("disabled")).toBe(true);
  await user.click(pending);
  await user.click(screen.getByLabelText("Password"));
  await user.keyboard("{Enter}");
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.(); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Log in" }).hasAttribute("disabled")).toBe(false));
});

it("checks file type and size before upload and permits a replacement after error", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const action = vi.fn();
  render(h(ValidatedForm, { action, schema: "image", defaults: {}, children: h(Fragment, null,
    h("label", { htmlFor: "image" }, "Cover"),
    h(ValidatedInput, { id: "image", name: "image", type: "file" }),
    h(SubmitButton, { children: "Upload" }),
  ) }));
  const input = screen.getByLabelText("Cover");
  await user.upload(input, new File(["bad"], "bad.txt", { type: "text/plain" }));
  await user.click(screen.getByRole("button", { name: "Upload" }));
  expect((await screen.findByRole("alert")).textContent).toContain("JPEG, PNG, or WebP");
  expect(action).not.toHaveBeenCalled();
  await user.upload(input, new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
  expect((await screen.findByRole("alert")).textContent).toContain("2 MiB");
  await user.upload(input, new File(["image bytes"], "cover.png", { type: "image/png" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("places schedule ordering errors on the end time and enforces UTF-8 password limits", () => {
  const result = formSchemas.event.safeParse({
    title: "A workshop", description: "Details", location: "", status: "DRAFT", capacity: "10",
    startsAt: "2031-03-02T12:00", endsAt: "2031-03-02T09:00",
  });
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].path).toEqual(["endsAt"]);
  expect(formSchemas.signup.safeParse({ name: "Ada", email: "ada@example.test", password: "😀".repeat(20) }).success).toBe(false);
});


it("refreshes returned server values and clears the password without a remount", async () => {
  const user = userEvent.setup();
  const action = vi.fn();
  const { rerender } = login(action);
  await user.type(screen.getByLabelText("Email"), "ADA@example.test");
  await user.type(screen.getByLabelText("Password"), "secret-value");
  rerender(loginForm(action, { email: "ada@example.test", password: "" }));
  expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("ada@example.test");
  expect(screen.getByLabelText<HTMLInputElement>("Password").value).toBe("");
});
