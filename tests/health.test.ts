import { expect, it } from "vitest";
import { GET as getHealth } from "@app/api/health/route";

it("returns only an ok status after a successful database query", async () => {
  const response = await getHealth();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
