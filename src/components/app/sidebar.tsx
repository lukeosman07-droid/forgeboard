"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { Icon, type IconName } from "@/components/work/ui";

// Layout for signed-in pages. On wide screens the sidebar is always visible;
// on phones it slides in from the menu button.
export default function SidebarFrame({
  nav,
  projects,
  footer,
  topbar,
  children,
}: {
  nav: React.ReactNode;
  projects: React.ReactNode;
  footer: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-1">
      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-slate-950 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo href="/dashboard" />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 lg:hidden">
            <Icon name="x" />
          </button>
        </div>
        {/* Close the mobile menu when any link in it is followed. */}
        <nav aria-label="Main" className="space-y-0.5 px-3 pt-2" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {nav}
        </nav>
        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {projects}
        </div>
        <div className="border-t border-white/10 p-3">{footer}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-slate-950/85 px-4 backdrop-blur sm:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/5 lg:hidden">
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-between gap-3">{topbar}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

const NAV: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/dashboard", label: "Home", icon: "home", exact: true },
  { href: "/dashboard/my-work", label: "My work", icon: "check" },
  { href: "/dashboard/billing", label: "Billing", icon: "card" },
];

// Reading the URL must happen inside <Suspense>; MainNavLinks is the fallback (no highlight).
export function MainNav() {
  return <MainNavLinks pathname={usePathname()} />;
}

export function MainNavLinks({ pathname }: { pathname: string | null }) {
  return NAV.map((item) => (
    <NavLink
      key={item.href}
      href={item.href}
      icon={<Icon name={item.icon} />}
      active={!!pathname && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`))}
    >
      {item.label}
    </NavLink>
  ));
}

function NavLink({ href, icon, active, children }: { href: string; icon: React.ReactNode; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
