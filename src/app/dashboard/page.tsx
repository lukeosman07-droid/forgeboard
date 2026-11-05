import type { Metadata } from "next";
import { Suspense } from "react";
import Logo from "@/components/Logo";
import { logout } from "@/app/(auth)/actions";
import { site } from "@/lib/site";
import DashboardContent from "./dashboard-content";

export const metadata: Metadata = { title: "Dashboard – Forgeboard" };

export default function DashboardPage() {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href="/dashboard" />
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        {/* The user's data is read per request, so it streams in behind this boundary. */}
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        © {site.year} {site.name} · Created by {site.builder}
      </footer>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading your dashboard">
      <div className="h-8 w-64 rounded bg-white/5" />
      <div className="h-24 rounded-2xl bg-white/5" />
      <div className="h-64 rounded-2xl bg-white/5" />
    </div>
  );
}
