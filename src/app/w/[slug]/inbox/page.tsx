import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getWorkspace } from "@/lib/workspaces";
import { listNotifications } from "@/server/notifications";
import Inbox from "./inbox";

export const metadata: Metadata = { title: "Inbox – Forgeboard" };

export default function InboxPage({ params }: PageProps<"/w/[slug]/inbox">) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight text-white">Inbox</h1>
      <p className="mt-1 text-slate-400">Assignments, mentions, comments and status changes on your tasks.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
        <InboxLoader params={params} />
      </Suspense>
    </div>
  );
}

async function InboxLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  const first = await listNotifications(slug);
  return <Inbox initial={first} />;
}
