import Logo from "@/components/Logo";
import { site } from "@/lib/site";

// Shared frame for /login and /signup.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12rem] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 shadow-xl shadow-black/30">
          {children}
        </div>
        <p className="mt-8 text-center text-xs text-slate-500">
          © {site.year} {site.name} · Created by {site.builder}
        </p>
      </div>
    </div>
  );
}
