import { Suspense } from "react";
import CommandPalette from "@/components/app/command-palette";
import NotificationBell from "@/components/app/notification-bell";
import SidebarFrame, { MainNav, MainNavLinks } from "@/components/app/sidebar";
import SidebarProjects, { SidebarProjectsFallback } from "@/components/app/sidebar-projects";
import UserCard from "@/components/app/user-card";
import WorkspaceSwitcher from "@/components/app/workspace-switcher";
import PlanBanner from "@/components/app/plan-banner";
import PlanBadge from "@/components/PlanBadge";
import type { PlanState } from "@/lib/plans";
import type { Role, Workspace } from "@/lib/types";
import type { WorkspaceSummary } from "@/lib/workspaces";

// Frame for pages inside a workspace: sidebar (workspace switcher, navigation,
// projects), top bar with search, and the page.
export default function AppShell({
  workspace,
  workspaces,
  canEdit,
  plan,
  role,
  checklist,
  user,
  children,
}: {
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  canEdit: boolean;
  plan: PlanState;
  role: Role;
  /** The first-run checklist, when it should show. */
  checklist?: React.ReactNode;
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
          <div className="flex items-center gap-2">
            <NotificationBell />
            <PlanBadge slug={workspace.slug} plan={plan} />
          </div>
        </>
      }
    >
      <PlanBanner plan={plan} role={role} slug={workspace.slug} />
      {checklist}
      {children}
    </SidebarFrame>
  );
}
