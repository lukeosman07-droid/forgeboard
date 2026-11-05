import Link from "next/link";
import Logo from "@/components/Logo";
import { logout } from "@/app/(auth)/actions";
import { site } from "@/lib/site";

// Shared frame for the dashboard and project pages. Static, so it shows instantly;
// each page streams in its own user data.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <Link href="/dashboard" className="hidden text-sm text-slate-300 hover:text-white sm:block">
              Projects
            </Link>
          </div>
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        © {site.year} {site.name} · Created by {site.builder}
      </footer>
    </>
  );
}
