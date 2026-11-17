"use client";

import ErrorScreen from "@/components/ErrorScreen";

// Shown inside the app frame, so the sidebar stays usable.
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} homeHref="/dashboard" homeLabel="Back to dashboard" />;
}
