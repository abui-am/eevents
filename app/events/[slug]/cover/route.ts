import "server-only";

import { getUser } from "@/lib/auth";
import { eventImageResponse } from "@/lib/event-image-response";
import { readEventCover } from "@/services/event-image-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const [{ slug }, viewer] = await Promise.all([params, getUser()]);
  return eventImageResponse(await readEventCover(slug, viewer));
}
