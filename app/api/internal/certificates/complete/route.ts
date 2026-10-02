import "server-only";

export const dynamic = "force-dynamic";

/** Retired upload callback: never accepts a new or replacement PDF. */
export async function POST(_request: Request) {
  void _request;
  return new Response(JSON.stringify({ error: "certificate_upload_retired" }), {
    status: 410,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
