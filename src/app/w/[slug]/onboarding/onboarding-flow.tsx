"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import InviteResult from "@/components/app/invite-result";
import { localToday } from "@/lib/dates";
import { TEMPLATES } from "@/lib/templates";
import { inviteMembers, renameWorkspace, type InviteOutcome } from "@/server/members";
import { createProject } from "@/server/projects";
import { completeOnboarding, createSampleProject } from "@/server/workspace";

// Three steps: name the workspace; open the sample project, start from a
// template or have AI plan one; invite teammates (skippable). Then the new
// project opens, with the setup checklist on top.

type Start = "sample" | "template" | "ai";

const inputClass =
  "mt-1 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
const primary = "rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60";

export default function OnboardingFlow({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(workspaceName);
  const [start, setStart] = useState<Start>("sample");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [emails, setEmails] = useState("");
  const [outcomes, setOutcomes] = useState<InviteOutcome[]>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const run = (work: () => Promise<void>) => {
    setError(undefined);
    startTransition(work);
  };

  function saveName() {
    run(async () => {
      if (name.trim() !== workspaceName) {
        const result = await renameWorkspace(slug, name);
        if (result.error) return setError(result.error);
      }
      setStep(2);
    });
  }

  async function createFirstProject() {
    setError(undefined);
    if (start === "sample") {
      run(async () => {
        const result = await createSampleProject(slug, localToday());
        if (!result.id) return setError(result.error ?? "Couldn't create the sample project.");
        setProjectId(result.id);
        setStep(3);
      });
      return;
    }
    if (!projectName.trim()) return setError("Give the project a name.");

    let plan = start === "template" ? TEMPLATES.find((t) => t.id === templateId)!.plan : null;
    if (start === "ai") {
      setGenerating(true);
      try {
        const res = await fetch("/api/ai/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: slug, name: projectName, description, today: localToday() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setError(body.error ?? "The AI couldn't plan that. Try a template instead.");
        plan = body.plan;
      } catch {
        return setError("Couldn't reach the server. Try again.");
      } finally {
        setGenerating(false);
      }
    }
    run(async () => {
      const result = await createProject(slug, { name: projectName, description, color: "orange", plan, today: localToday() });
      if (!result.id) return setError(result.error ?? "Couldn't create the project.");
      setProjectId(result.id);
      setStep(3);
    });
  }

  function finish() {
    run(async () => {
      const result = await completeOnboarding(slug);
      if (result.error) return setError(result.error);
      router.push(projectId ? `/w/${slug}/projects/${projectId}?view=overview` : `/w/${slug}`);
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex gap-2" aria-label="Setup steps">
        {["Workspace", "First project", "Team"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={`flex-1 rounded-full px-3 py-1 text-center text-xs font-medium ${
              step > i + 1 ? "bg-orange-500/20 text-orange-300" : step === i + 1 ? "bg-orange-500 text-slate-950" : "bg-white/5 text-slate-500"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8">
        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <h1 className="text-2xl font-bold text-white">Name your workspace</h1>
            <p className="mt-1 text-slate-400">Usually your firm&apos;s name. Everyone you invite will see it.</p>
            <label className="mt-6 block">
              <span className="text-sm font-medium text-slate-200">Workspace name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus className={inputClass} />
            </label>
            <div className="mt-8 flex justify-end">
              <button type="submit" disabled={pending} className={primary}>
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createFirstProject();
            }}
          >
            <h1 className="text-2xl font-bold text-white">Start your first project</h1>
            <p className="mt-1 text-slate-400">You can add more, or delete this one, at any time.</p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How to start">
              {(
                [
                  ["sample", "Sample project", "Explore a filled-in project"],
                  ["template", "Template", "A proven structure"],
                  ["ai", "✨ AI plan", "Describe it, AI plans it"],
                ] as const
              ).map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={start === id}
                  onClick={() => setStart(id)}
                  className={`rounded-xl border p-3 text-left transition ${start === id ? "border-orange-500/70 bg-orange-500/10" : "border-white/10 hover:border-white/25"}`}
                >
                  <span className="block text-sm font-semibold text-white">{label}</span>
                  <span className="block text-xs text-slate-400">{sub}</span>
                </button>
              ))}
            </div>

            {start === "sample" ? (
              <p className="mt-6 text-sm text-slate-300">
                A pump station retrofit with a schedule, decisions, risks and the meeting notes they came from, so you can see every view
                with real content.
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Project name</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Elm St Pump Station"
                    className={inputClass}
                  />
                </label>
                {start === "template" ? (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Template</span>
                    <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Describe the project</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder="Scope, deliverables and rough timing. The more detail, the better the plan."
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button type="submit" disabled={pending || generating} className={primary}>
                {generating ? "Planning…" : start === "sample" ? "Open the sample project" : "Create project"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await inviteMembers(slug, emails, "member");
                if (result.outcomes) setOutcomes(result.outcomes);
                else if (result.error) setError(result.error);
              });
            }}
          >
            <h1 className="text-2xl font-bold text-white">Invite your team</h1>
            <p className="mt-1 text-slate-400">They join as members and see every project. You can add clients as free guests later.</p>
            <label className="mt-6 block">
              <span className="text-sm font-medium text-slate-200">Email addresses</span>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={2}
                placeholder="name@firm.com, another@firm.com"
                className={inputClass}
              />
            </label>
            {outcomes && (
              <div className="mt-4">
                <InviteResult outcomes={outcomes} />
              </div>
            )}
            <div className="mt-8 flex flex-wrap justify-end gap-3">
              {outcomes ? (
                <button type="button" onClick={finish} disabled={pending} className={primary}>
                  Go to my project
                </button>
              ) : (
                <>
                  <button type="button" onClick={finish} disabled={pending} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">
                    Skip for now
                  </button>
                  <button type="submit" disabled={pending || !emails.trim()} className={primary}>
                    Send invites
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
