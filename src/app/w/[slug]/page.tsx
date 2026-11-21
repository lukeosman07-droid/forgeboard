import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardContent from "./dashboard-content";

export const metadata: Metadata = { title: "Home – Forgeboard" };

export default function WorkspaceHomePage({ params }: PageProps<"/w/[slug]">) {
  return (
    // The user's data is read per request, so it streams in behind this boundary.
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent params={params} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading your dashboard">
      <div className="h-8 w-64 rounded bg-white/5" />
      <div className="h-24 rounded-2xl bg-white/5" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-44 rounded-2xl bg-white/5" />
        <div className="h-44 rounded-2xl bg-white/5" />
        <div className="h-44 rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
