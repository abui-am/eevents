import { vi } from "vitest";

const testRuntime = vi.hoisted(() => ({
  cookieToken: null as string | null,
  headerValues: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name.endsWith("eevents_session") && testRuntime.cookieToken
        ? { name, value: testRuntime.cookieToken }
        : undefined,
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => ({
    get: (name: string) => testRuntime.headerValues.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: (destination: string): never => {
    throw Object.assign(new Error("Test redirect"), {
      code: "TEST_REDIRECT",
      destination,
    });
  },
  notFound: (): never => {
    throw Object.assign(new Error("Test not found"), {
      code: "TEST_NOT_FOUND",
      status: 404,
    });
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

export function setTestCookieToken(token: string | null): void {
  testRuntime.cookieToken = token;
}

export function setTestHeaders(values: Record<string, string>): void {
  testRuntime.headerValues = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
}
