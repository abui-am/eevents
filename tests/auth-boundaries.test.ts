import { expect, it } from "vitest";
import { signUp } from "@app/actions/auth";
import {
  createAdminEventAction,
  setAdminRegistrationStatusAction,
} from "@app/actions/admin-events";
import AdminPage from "@app/admin/page";
import CertificateIssuePage from "@app/admin/registrations/[id]/certificate/page";
import MyEventsPage from "@app/my/page";
import { db } from "@/lib/db";
import { createTestSession, createTestUser } from "./support/database";

async function expectGuardCode(
  operation: Promise<unknown>,
  code: "TEST_REDIRECT" | "TEST_NOT_FOUND",
) {
  try {
    await operation;
    throw new Error(`Expected ${code} from the access guard.`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

it("redirects anonymous users from My Events and the admin dashboard", async () => {
  await expectGuardCode(
    MyEventsPage({ searchParams: Promise.resolve({}) }),
    "TEST_REDIRECT",
  );
  await expectGuardCode(
    AdminPage({ searchParams: Promise.resolve({}) }),
    "TEST_REDIRECT",
  );
});

it("blocks participant requests to admin event and certificate operations", async () => {
  const participant = await createTestUser();
  await createTestSession(participant.id);

  await expectGuardCode(createAdminEventAction(new FormData()), "TEST_NOT_FOUND");
  await expectGuardCode(
    setAdminRegistrationStatusAction(new FormData()),
    "TEST_NOT_FOUND",
  );
  await expectGuardCode(
    CertificateIssuePage({
      params: Promise.resolve({ id: "registration-test" }),
      searchParams: Promise.resolve({}),
    }),
    "TEST_NOT_FOUND",
  );
  await expectGuardCode(
    AdminPage({ searchParams: Promise.resolve({}) }),
    "TEST_NOT_FOUND",
  );
  expect(await db.event.count()).toBe(0);
});

it("ignores a client-supplied ADMIN role during signup", async () => {
  const formData = new FormData();
  formData.set("name", "Ada Example");
  formData.set("email", "ada-role-test@example.test");
  formData.set("password", "correct-horse-battery-41");
  formData.set("role", "ADMIN");

  await expectGuardCode(signUp(formData), "TEST_REDIRECT");

  await expect(
    db.user.findUnique({
      where: { email: "ada-role-test@example.test" },
      select: { role: true },
    }),
  ).resolves.toEqual({ role: "PARTICIPANT" });
});
