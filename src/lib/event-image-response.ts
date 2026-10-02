import "server-only";

import type { EventImageRead } from "@/services/event-image-access";

const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
} as const;

function imageHeaders(cacheControl: string, contentType: string): HeadersInit {
  return {
    ...SAFE_HEADERS,
    "Cache-Control": cacheControl,
    "Content-Type": contentType,
  };
}

export function eventImageResponse(result: EventImageRead): Response {
  if (result.status === 404) {
    return new Response("Not found.", {
      status: 404,
      headers: imageHeaders("no-store", "text/plain; charset=utf-8"),
    });
  }
  if (result.status === 503) {
    return new Response("Image storage is unavailable.", {
      status: 503,
      headers: imageHeaders("no-store", "text/plain; charset=utf-8"),
    });
  }

  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: imageHeaders(result.cacheControl, "image/webp"),
  });
}
