import "server-only";

import { headers } from "next/headers";
import { EventMediaError } from "@/lib/event-media-error";

function originHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function headerHost(value: string): string | null {
  const first = value.split(",")[0]?.trim().toLowerCase();
  if (!first || first.includes("/") || /\s/u.test(first)) return null;
  try {
    const url = new URL(`http://${first}`);
    if (!url.hostname) return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Image mutations compare Origin to x-forwarded-host when that header is present,
 * otherwise to Host. A session cookie alone is not enough.
 */
export async function assertMutationOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const originValue = origin ? originHost(origin) : null;
  if (!originValue) throw new EventMediaError("origin_rejected");

  const forwarded = headerList.get("x-forwarded-host");
  const hasForwarded = Boolean(forwarded?.trim());
  const expected = hasForwarded
    ? headerHost(forwarded ?? "")
    : headerHost(headerList.get("host") ?? "");
  if (!expected || expected !== originValue) {
    throw new EventMediaError("origin_rejected");
  }
}
