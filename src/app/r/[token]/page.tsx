import type { Metadata } from "next";
import { Suspense } from "react";
import Logo from "@/components/Logo";
import type { StatusReport } from "@/lib/ai/assist-schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Weekly report – Forgeboard", robots: { index: false, follow: false } };

// A weekly AI report, read-only, for anyone with the link until it expires.
// shared_report() in the database checks the token and the expiry.
export default function SharedReportPage({ params }: PageProps<"/r/[token]">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b border-white/10 px-4 sm:px-8">
        <Logo href="/" />
      </header>
      <main className="flex flex-1 justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <Suspense fallback={<p className="text-slate-400">Loading the report…</p>}>
            <Report params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

type Shared = { project_name: string; workspace_name: string; week_of: string; report: StatusReport; created_at: string; expires_at: string };

const HEALTH: Record<StatusReport["health"], { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-emerald-500/15 text-emerald-300" },
  at_risk: { label: "At risk", className: "bg-amber-500/15 text-amber-300" },
  off_track: { label: "Off track", className: "bg-red-500/15 text-red-300" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

async function Report({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/.test(token) && supabase ? await supabase.rpc("shared_report", { p_token: token }) : { data: null };
  const shared = (data as Shared[] | null)?.[0];

  if (!shared) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8">
        <h1 className="text-2xl font-bold text-white">This report link has expired</h1>
        <p className="mt-3 text-slate-400">Shared reports stay open for 30 days, or until the project&apos;s manager stops sharing them. Ask them for a new link.</p>
      </div>
    );
  }

  const r = shared.report;
  const health = HEALTH[r.health] ?? HEALTH.on_track;
  const groups: [string, string[]][] = [
    ["Highlights", r.highlights],
    ["Concerns", r.concerns],
    ["Next steps", r.next_steps],
  ];
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-8">
      <p className="text-sm text-slate-400">
        {shared.workspace_name} · Weekly report · week of {day(shared.week_of)}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{shared.project_name}</h1>
      <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${health.className}`}>{health.label}</span>
      <p className="mt-4 text-lg text-slate-200">{r.headline}</p>
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <section key={title} className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-400">{title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      <p className="mt-8 border-t border-white/10 pt-4 text-xs text-slate-500">
        Written by Forgeboard AI from the project&apos;s live tasks on {day(shared.created_at)}. Read-only link, open until {day(shared.expires_at)}.
      </p>
    </article>
  );
}
