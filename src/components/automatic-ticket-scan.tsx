"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scanTicketAction } from "@app/actions/check-in";

export function AutomaticTicketScan({ eventId, ticket }: { eventId: string; ticket: string }) {
  const router = useRouter();
  const request = useRef<ReturnType<typeof scanTicketAction> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    request.current ??= scanTicketAction(eventId, ticket);
    void request.current.then((result) => {
      if (cancelled) return;
      if ("href" in result) router.replace(result.href);
      else setError(result.error);
    }).catch(() => {
      if (!cancelled) setError("Could not record this scan. Check your connection and try again.");
    });
    return () => { cancelled = true; };
  }, [eventId, ticket, attempt, router]);
  return <div>
    {error ? <><p role="alert">{error}</p><button className="button" type="button" onClick={() => {
      request.current = null; setError(null); setAttempt((value) => value + 1);
    }}>Retry scan</button></> : <p role="status">Recording onsite scan…</p>}
  </div>;
}
