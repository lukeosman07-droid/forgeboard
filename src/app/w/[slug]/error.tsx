"use client";

import ErrorScreen from "@/components/ErrorScreen";
import { useWorkspacePath } from "@/components/app/workspace-context";

// Shown inside the app frame, so the sidebar stays usable.
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const path = useWorkspacePath();
  return <ErrorScreen error={error} retry={retry} homeHref={path()} homeLabel="Back to home" />;
}
