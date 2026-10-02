"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isValidTimeZone } from "@/lib/time-zone";

const ViewerTimeZoneContext = createContext({ timeZone: "UTC", ready: false });

export function ViewerTimeZoneProvider({ children }: { children: ReactNode }) {
  const [detected, setDetected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setDetected(isValidTimeZone(zone) ? zone : "UTC");
    } catch {
      setDetected("UTC");
    }
  }, []);
  const value = useMemo(() => ({ timeZone: detected ?? "UTC", ready: detected !== null }), [detected]);
  return <ViewerTimeZoneContext value={value}>{children}</ViewerTimeZoneContext>;
}

export function useViewerTimeZone() {
  return useContext(ViewerTimeZoneContext);
}
