import type { NextConfig } from "next";

const scriptPolicy =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `form-action 'self'${supabaseFormOrigin() ? ` ${supabaseFormOrigin()}` : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  scriptPolicy,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
].join("; ");

function supabaseFormOrigin(): string | null {
  const value = process.env.SUPABASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/my/registrations/:id/ticket",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/api/tickets/:id/qr",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/admin/events/:id/check-in",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        source: "/admin/registrations/:id/certificate",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ];
  },
};

export default nextConfig;
