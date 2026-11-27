"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { usePeople, useWorkspace, useWorkspacePath } from "@/components/app/workspace-context";
import { formatDate } from "@/lib/dates";
import { displayName } from "@/lib/people";
import type { Project } from "@/lib/types";
import { getReports, saveReportSettings, stopSharingReport, type ReportSettings, type ReportSummary } from "@/server/reports";

// The project's weekly AI report: written every Monday and emailed to the
// people picked here (guests too), each with a read-only link that expires.
export default function WeeklyReports({ project, sharedWith }: { project: Pick<Project, "id" | "manager_id">; sharedWith: string[] }) {
  const { isAdmin, userId, limits, canEdit } = useWorkspace();
  const { people } = usePeople();
  const path = useWorkspacePath();
  const canManage = canEdit && (isAdmin || project.manager_id === userId);
  const available = limits.features.workload;
  const [data, setData] = useState<{ settings: ReportSettings; reports: ReportSummary[] } | null>(null);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [writing, setWriting] = useState(false);
  const [pending, start] = useTransition();
  // When the list was loaded, to tell live share links from expired ones.
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(
    () =>
      getReports(project.id).then((d) => {
        setLoadedAt(Date.now());
        setData(d);
      }),
    [project.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Guests can only receive it if the project is shared with them.
  const eligible = people.filter((p) => p.role !== "guest" || sharedWith.includes(p.user_id));

  function save(settings: ReportSettings) {
    setData((d) => (d ? { ...d, settings } : d));
    start(async () => {
      setError(undefined);
      const result = await saveReportSettings(project.id, settings);
      if (result.error) {
        setError(result.error);
        void load();
      }
    });
  }

  async function writeNow(email: boolean) {
    setWriting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const res = await fetch("/api/ai/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Couldn't write the report.");
      else {
        setMessage(email ? `This week's report is ready and went to ${body.emailed} ${body.emailed === 1 ? "person" : "people"}.` : "This week's report is ready.");
        await load();
      }
    } finally {
      setWriting(false);
    }
  }

  if (!available) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="font-semibold text-white">Weekly report</h2>
        <p className="mt-1 text-sm text-slate-400">
          A Monday AI report emailed to your team and clients, with a read-only link. On the Business plan.{" "}
          <Link href={path("/billing")} className="text-orange-300 hover:text-orange-200">
            See plans
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" aria-label="Weekly report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Weekly report</h2>
          <p className="mt-0.5 text-sm text-slate-400">Written by AI every Monday from the live tasks, and emailed to the people below.</p>
        </div>
        {canManage && data && (
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={data.settings.enabled}
              disabled={pending}
              onChange={(e) => save({ ...data.settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-orange-500"
            />
            Send every Monday
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {message}
        </p>
      )}

      {!data ? (
        <div className="mt-4 h-16 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          {canManage && (
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recipients</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {eligible.map((p) => {
                  const on = data.settings.recipientIds.includes(p.user_id);
                  return (
                    <label
                      key={p.user_id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-orange-500/50 bg-orange-500/10 text-orange-200" : "border-white/10 text-slate-300"}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        disabled={pending}
                        onChange={() =>
                          save({
                            ...data.settings,
                            recipientIds: on ? data.settings.recipientIds.filter((id) => id !== p.user_id) : [...data.settings.recipientIds, p.user_id],
                          })
                        }
                      />
                      {displayName(p)}
                      {p.role === "guest" && <span className="text-slate-500">(guest)</span>}
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={writing}
                  onClick={() => void writeNow(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/5 disabled:opacity-50"
                >
                  {writing ? "Writing…" : "Write this week's report now"}
                </button>
                <button
                  type="button"
                  disabled={writing || data.settings.recipientIds.length === 0}
                  onClick={() => void writeNow(true)}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  …and email it
                </button>
              </div>
            </fieldset>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Past reports</p>
            {data.reports.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.reports.map((r) => {
                  const live = new Date(r.share_expires_at).getTime() > loadedAt;
                  return (
                    <li key={r.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">Week of {formatDate(r.week_of)}</span>
                        <span className="flex items-center gap-2 text-xs">
                          {live ? (
                            <>
                              <a href={`/r/${r.share_token}`} target="_blank" rel="noopener noreferrer" className="text-orange-300 hover:text-orange-200">
                                Share link
                              </a>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/r/${r.share_token}`)}
                                className="text-slate-400 hover:text-white"
                              >
                                Copy
                              </button>
                              <span className="text-slate-500">until {formatDate(r.share_expires_at.slice(0, 10))}</span>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    start(async () => {
                                      const result = await stopSharingReport(r.id);
                                      if (result.error) setError(result.error);
                                      else void load();
                                    })
                                  }
                                  className="text-slate-400 hover:text-red-300"
                                >
                                  Stop sharing
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-500">Link expired</span>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">{r.report.headline}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
