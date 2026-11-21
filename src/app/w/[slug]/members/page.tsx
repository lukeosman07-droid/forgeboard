import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { emailIsConfigured } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import type { Invite } from "@/lib/types";
import { getWorkspace } from "@/lib/workspaces";
import MembersPanel from "./members-panel";

export const metadata: Metadata = { title: "Members – Forgeboard" };

export default function MembersPage({ params }: PageProps<"/w/[slug]/members">) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Members</h1>
        <p className="mt-1 text-slate-400">Who can see and work in this workspace.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60" />}>
        <MembersContent params={params} />
      </Suspense>
    </div>
  );
}

async function MembersContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  const supabase = await createClient();
  if (!access || !supabase) notFound();
  const { workspace } = access;

  // Admins see every pending invite; a member sees the guest invites they sent.
  const [limit, used, invites] = await Promise.all([
    supabase.rpc("workspace_seat_limit", { ws: workspace.id }),
    supabase.rpc("workspace_seats_used", { ws: workspace.id }),
    access.role === "guest"
      ? { data: [] }
      : supabase
          .from("workspace_invites")
          .select("id, workspace_id, email, role, project_id, invited_by, created_at, expires_at, projects(name)")
          .eq("workspace_id", workspace.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .overrideTypes<(Invite & { projects: { name: string } | null })[], { merge: false }>(),
  ]);

  return (
    <MembersPanel
      seats={{ used: Number(used.data ?? 0), limit: Number(limit.data ?? 0) }}
      invites={(invites.data ?? []).map(({ projects, ...invite }) => ({ ...invite, project_name: projects?.name ?? null }))}
      emailReady={emailIsConfigured()}
    />
  );
}
