import { Suspense } from "react";
import CommandPalette from "@/components/app/command-palette";
import SidebarFrame, { MainNav, MainNavLinks } from "@/components/app/sidebar";
import SidebarProjects, { SidebarProjectsFallback } from "@/components/app/sidebar-projects";
import UserCard from "@/components/app/user-card";
import PlanBadge from "@/components/PlanBadge";

// Frame for signed-in pages: sidebar (navigation + projects), top bar with
// search, and the page. The frame shows instantly; user data streams in.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarFrame
      nav={
        <Suspense fallback={<MainNavLinks pathname={null} />}>
          <MainNav />
        </Suspense>
      }
      projects={
        <Suspense fallback={<SidebarProjectsFallback />}>
          <SidebarProjects />
        </Suspense>
      }
      footer={
        <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-white/5" />}>
          <UserCard />
        </Suspense>
      }
      topbar={
        <>
          <CommandPalette />
          <Suspense fallback={<span className="h-7 w-20 animate-pulse rounded-full bg-white/5" />}>
            <PlanBadge />
          </Suspense>
        </>
      }
    >
      {children}
    </SidebarFrame>
  );
}
