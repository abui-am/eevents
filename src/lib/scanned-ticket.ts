/** Extract a ticket only from this event's local review URL. Never navigate to QR content. */
export function scannedTicketReference(raw: string, eventId: string, origin: string): string | null {
  if (raw.length > 2_048) return null;
  try {
    const url = new URL(raw);
    if (url.origin !== origin || url.username || url.password || url.hash ||
        url.pathname !== `/admin/events/${eventId}/check-in` ||
        url.searchParams.getAll("ticket").length !== 1 ||
        [...url.searchParams.keys()].some((key) => key !== "ticket")) return null;
    const ticket = url.searchParams.get("ticket");
    return ticket && ticket.length <= 1_024 ? ticket : null;
  } catch {
    return null;
  }
}
