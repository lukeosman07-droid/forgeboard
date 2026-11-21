import { Suspense } from "react";
import CommandPalette from "@/components/app/command-palette";
import SidebarFrame, { MainNav, MainNavLinks } from "@/components/app/sidebar";
import SidebarProjects, { SidebarProjectsFallback } from "@/components/app/sidebar-projects";
import UserCard from "@/components/app/user-card";
import WorkspaceSwitcher from "@/components/app/workspace-switcher";
import PlanBadge from "@/components/PlanBadge";
import type { Workspace } from "@/lib/types";
import type { WorkspaceSummary } from "@/lib/workspaces";

// Frame for pages inside a workspace: sidebar (workspace switcher, navigation,
// projects), top bar with search, and the page.
export default function AppShell({
  workspace,
  workspaces,
  canEdit,
  user,
  children,
}: {
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  canEdit: boolean;
  user: { id: string; email: string | null; name: string };
  children: React.ReactNode;
}) {
  return (
    <SidebarFrame
      switcher={<WorkspaceSwitcher workspaces={workspaces} />}
      nav={
        <Suspense fallback={<MainNavLinks pathname={null} />}>
          <MainNav />
        </Suspense>
      }
      projects={
        <Suspense fallback={<SidebarProjectsFallback canEdit={canEdit} />}>
          <SidebarProjects workspaceId={workspace.id} canEdit={canEdit} />
        </Suspense>
      }
      footer={<UserCard user={user} />}
      topbar={
        <>
          <CommandPalette />
          <Suspense fallback={<span className="h-7 w-20 animate-pulse rounded-full bg-white/5" />}>
            <PlanBadge slug={workspace.slug} />
          </Suspense>
        </>
      }
    >
      {children}
    </SidebarFrame>
  );
}
