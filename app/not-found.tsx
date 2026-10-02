import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader user={null} />
      <main id="main-content" tabIndex={-1} className="status-shell">
        <section className="empty-state" aria-labelledby="not-found-title">
          <p className="eyebrow">404</p>
          <h1 id="not-found-title">We couldn’t find that page</h1>
          <p>
            The link may be out of date, or the event may not be available.
          </p>
          <Link className="button" href="/">
            Browse events
          </Link>
        </section>
      </main>
    </>
  );
}
