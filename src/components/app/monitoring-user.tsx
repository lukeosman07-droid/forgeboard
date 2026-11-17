"use client";

import { useEffect } from "react";
import { withSentry } from "@/lib/monitoring/report";

// Tags error reports with the signed-in user's ID (never their email or name),
// so a report can be matched to an account without storing personal data.
export default function MonitoringUser({ id }: { id: string | null }) {
  useEffect(() => {
    withSentry((sentry) => sentry.setUser(id ? { id } : null));
  }, [id]);
  return null;
}
