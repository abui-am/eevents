import "server-only";

import QRCode from "qrcode";
import { getUser } from "@/lib/auth";
import { createCheckInUrl } from "@/lib/check-in-tickets";
import { getTicketPresentation } from "@/services/ticket-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const [{ id }, user] = await Promise.all([params, getUser()]);
  if (!user) return textResponse("Authentication required.", 401);

  const ticket = await getTicketPresentation(id, user);
  if (!ticket || !ticket.usable || !ticket.ticketVersion) {
    return textResponse("Ticket not found.", 404);
  }

  try {
    const payload = createCheckInUrl({
      eventId: ticket.event.id,
      registrationId: ticket.id,
      ticketVersion: ticket.ticketVersion,
    });
    const svg = await QRCode.toString(payload, {
      type: "svg",
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#000000ff", light: "#ffffffff" },
    });

    return new Response(svg, {
      status: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": "image/svg+xml; charset=utf-8",
      },
    });
  } catch {
    console.error("Ticket QR generation failed.");
    return textResponse("Ticket image is temporarily unavailable.", 503);
  }
}
