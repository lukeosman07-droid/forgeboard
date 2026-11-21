import { notFound } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { WorkspaceProvider } from "@/components/app/workspace-context";
import { displayName } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace, listWorkspaces } from "@/lib/workspaces";

// Frame for every page inside a workspace: /w/<slug>/...
// It loads the workspace and the viewer's role once; pages and client components
// read them from the provider. Someone who isn't a member gets a 404, the same
// as for a workspace that doesn't exist.
export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params;
  const access = await getWorkspace(slug);
  if (!access) notFound();
  const { workspace, user, role, people } = access;

  const supabase = await createClient();
  const [workspaces, profile] = await Promise.all([
    listWorkspaces(),
    supabase?.from("profiles").select("last_workspace_id").eq("id", user.id).maybeSingle<{ last_workspace_id: string | null }>(),
  ]);
  const me = people.find((p) => p.user_id === user.id);

  return (
    <WorkspaceProvider
      value={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        plan: workspace.plan,
        userId: user.id,
        role,
        canEdit: access.canEdit,
        isAdmin: access.isAdmin,
        people,
      }}
      rememberAsLast={profile?.data?.last_workspace_id !== workspace.id}
    >
      <AppShell
        workspace={workspace}
        workspaces={workspaces}
        canEdit={access.canEdit}
        user={{ id: user.id, email: user.email, name: me ? displayName(me) : (user.email?.split("@")[0] ?? "You") }}
      >
        {children}
      </AppShell>
    </WorkspaceProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-1" aria-label="Loading your workspace">
      <div className="hidden w-64 shrink-0 border-r border-white/10 p-4 lg:block">
        <div className="h-8 w-36 animate-pulse rounded bg-white/5" />
        <div className="mt-8 space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        </div>
      </div>
      <div className="flex-1 space-y-6 p-8">
        <div className="h-8 w-64 animate-pulse rounded bg-white/5" />
        <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
