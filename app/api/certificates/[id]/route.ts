import "server-only";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAuthorizedCertificateDownload } from "@/services/certificate-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

export async function GET(_request: Request, { params }: RouteContext) {
  const [{ id }, viewer] = await Promise.all([params, requireUser()]);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();

  let signedUrl: string | null;
  try {
    signedUrl = await getAuthorizedCertificateDownload(id, viewer);
  } catch {
    return new Response("Certificate download is temporarily unavailable.", {
      status: 503,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!signedUrl) notFound();
  return NextResponse.redirect(signedUrl, { status: 307, headers: privateHeaders });
}
