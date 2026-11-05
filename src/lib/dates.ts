import { useSyncExternalStore } from "react";

// Today's date (YYYY-MM-DD) in the viewer's own time zone.
export function localToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Hook version: null during server rendering, the local date once in the browser.
// Avoids hydration mismatches when the server and viewer are in different time zones.
export function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    localToday,
    () => null,
  );
}

// "2026-11-14" -> "Nov 14" (no time zone shifts: due dates are plain dates).
export function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
