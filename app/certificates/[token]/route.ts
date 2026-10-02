import "server-only";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response("Certificate not found.", { status: 404, headers });
  const certificate = await db.certificate.findUnique({ where: { token }, select: { html: true } });
  if (!certificate) return new Response("Certificate not found.", { status: 404, headers });
  return new Response(certificate.html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
