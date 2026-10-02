import { describe, expect, it } from "vitest";
import { signupSchema } from "@/lib/validation";
import { saveAdminEvent } from "@/services/admin-event-service";

describe("input validation", () => {
  it("rejects malformed email addresses and short passwords", () => {
    expect(
      signupSchema.safeParse({
        name: "Ada Example",
        email: "not-an-email",
        password: "correct-horse-41",
      }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({
        name: "Ada Example",
        email: "ada@example.test",
        password: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects an event whose end time is not after its start time", async () => {
    const input = {
      title: "UTC Workshop",
      description: "A useful workshop.",
      location: "",
      startsAt: "2030-06-01T09:00",
      endsAt: "2030-06-01T09:00",
      capacity: "20",
      status: "PUBLISHED",
    };

    await expect(saveAdminEvent("admin-test", null, input)).rejects.toMatchObject({
      code: "invalid_schedule",
    });
  });

  it("rejects a zero capacity before writing an event", async () => {
    await expect(
      saveAdminEvent("admin-test", null, {
        title: "UTC Workshop",
        description: "A useful workshop.",
        location: "",
        startsAt: "2030-06-01T09:00",
        endsAt: "2030-06-01T10:00",
        capacity: "0",
        status: "PUBLISHED",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
