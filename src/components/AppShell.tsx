import Link from "next/link";
import { Suspense } from "react";
import Logo from "@/components/Logo";
import PlanBadge from "@/components/PlanBadge";
import { logout } from "@/app/(auth)/actions";
import { site } from "@/lib/site";

// Frame for signed-in pages (dashboard, projects, billing, checkout success).
// The frame itself is static so it shows instantly; the plan badge streams in.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <Link href="/dashboard" className="hidden text-sm text-slate-300 hover:text-white sm:block">
              Projects
            </Link>
            <Link href="/dashboard/billing" className="hidden text-sm text-slate-300 hover:text-white sm:block">
              Billing
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Suspense fallback={<span className="h-7 w-20 animate-pulse rounded-full bg-white/5" />}>
              <PlanBadge />
            </Suspense>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                Log out
              </button>
            </form>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        © {site.year} {site.name} · Created by {site.builder}
      </footer>
    </>
  );
}
