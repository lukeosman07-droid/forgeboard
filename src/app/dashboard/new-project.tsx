"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PlanOutput } from "@/lib/ai/assist";
import { Icon } from "@/components/work/ui";
import { localToday } from "@/lib/dates";
import { TEMPLATES } from "@/lib/templates";
import type { ProjectColor } from "@/lib/types";
import { COLOR_NAMES, colorOf } from "@/lib/work";
import { createProject, type ProjectPlan } from "./actions";

type Mode = "blank" | "template" | "ai";

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

// "New project" button + dialog: start blank, from a template, or from an AI-generated plan.
export default function NewProjectButton({ variant = "primary" }: { variant?: "primary" | "large" | "sidebar" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);

  const open = () => {
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  };

  return (
    <>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={open}
          aria-label="New project"
          title="New project"
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <Icon name="plus" />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className={
            variant === "large"
              ? "rounded-lg bg-orange-500 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-400"
              : "flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
          }
        >
          <Icon name="plus" /> New project
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
      >
        <NewProjectForm key={formKey} onClose={() => dialogRef.current?.close()} />
      </dialog>
    </>
  );
}

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("blank");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("orange");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [aiPlan, setAiPlan] = useState<PlanOutput>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean }>();
  const [pending, startTransition] = useTransition();

  const template = TEMPLATES.find((t) => t.id === templateId)!;

  async function generate() {
    setError(undefined);
    if (!name.trim()) return setError({ message: "Give your project a name first." });
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, today: localToday() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError({ message: body.error ?? "Something went wrong.", upgrade: body.code === "trial_exhausted" });
      setAiPlan(body.plan);
    } catch {
      setError({ message: "Couldn't reach the server. Try again." });
    } finally {
      setGenerating(false);
    }
  }

  function create() {
    setError(undefined);
    const plan: ProjectPlan | null = mode === "template" ? template.plan : mode === "ai" ? (aiPlan ?? null) : null;
    if (mode === "ai" && !plan) return setError({ message: "Generate a plan first, or switch to Blank." });
    startTransition(async () => {
      const result = await createProject({ name, description, color, plan, today: localToday() });
      if (result.error && !result.id) return setError({ message: result.error });
      onClose();
      router.push(`/dashboard/projects/${result.id}?view=${mode === "blank" ? "table" : "timeline"}`);
    });
  }

  const planTaskCount = (p?: ProjectPlan) => p?.sections.reduce((n, s) => n + s.tasks.length, 0) ?? 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
      className="flex max-h-[90vh] flex-col"
    >
      <div className="flex items-start justify-between border-b border-white/10 p-6 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">New project</h2>
          <p className="mt-1 text-sm text-slate-400">Start from scratch, a template, or let AI draft the plan.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
          <Icon name="x" />
        </button>
      </div>

      <div className="space-y-5 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How to start">
          {(
            [
              ["blank", "Blank", "An empty project"],
              ["template", "Template", "Proven structure"],
              ["ai", "✨ AI plan", "Describe it, AI plans it"],
            ] as const
          ).map(([id, label, sub]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-xl border p-3 text-left transition ${
                mode === id ? "border-orange-500/70 bg-orange-500/10" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span className="block text-sm font-semibold text-white">{label}</span>
              <span className="block text-xs text-slate-400">{sub}</span>
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error.message}
            {error.upgrade && (
              <Link href="/pricing" className="ml-2 font-semibold text-orange-300 underline">
                See plans →
              </Link>
            )}
          </p>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-200">Project name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
            placeholder="e.g. Pump Station Retrofit"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-200">
            Description{" "}
            <span className="font-normal text-slate-500">{mode === "ai" ? "(the more detail, the better the plan)" : "(optional)"}</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setAiPlan(undefined);
            }}
            rows={mode === "ai" ? 4 : 2}
            maxLength={2000}
            placeholder={
              mode === "ai"
                ? "e.g. Replace two 40 HP pumps with VFD-driven units, add SCADA monitoring, and keep the station running during cutover. About 3 months."
                : "What is this project about?"
            }
            className={inputClass}
          />
        </label>

        <div>
          <span className="text-sm font-medium text-slate-200">Color</span>
          <div className="mt-2 flex gap-2">
            {COLOR_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${colorOf(c).dot} ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : ""}`}
              />
            ))}
          </div>
        </div>

        {mode === "template" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={templateId === t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setColor(t.color as ProjectColor);
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  templateId === t.id ? "border-orange-500/70 bg-orange-500/10" : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className={`h-2.5 w-2.5 rounded-sm ${colorOf(t.color).dot}`} />
                  {t.name}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{t.blurb}</span>
                <span className="mt-2 block text-xs text-slate-500">
                  {t.plan.sections.length} sections · {planTaskCount(t.plan)} tasks
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "ai" && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.05] p-4">
            {!aiPlan ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-300">
                  {generating ? "Planning phases, tasks and a schedule… (about 20 seconds)" : "AI builds sections, tasks and a schedule you can edit."}
                </p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
                >
                  {generating && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />}
                  {generating ? "Generating…" : "Generate plan"}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">
                    Draft plan: {aiPlan.sections.length} sections · {planTaskCount(aiPlan)} tasks
                  </p>
                  <button type="button" onClick={generate} disabled={generating} className="text-xs text-orange-400 hover:text-orange-300">
                    {generating ? "Regenerating…" : "Regenerate"}
                  </button>
                </div>
                <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
                  {aiPlan.sections.map((s, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">{s.name}</p>
                      <ul className="mt-1 space-y-0.5 text-sm text-slate-300">
                        {s.tasks.map((task, j) => (
                          <li key={j} className="flex justify-between gap-3">
                            <span className="truncate">{task.title}</span>
                            <span className="shrink-0 text-xs text-slate-500">{task.duration_days}d</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-white/10 p-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim() || (mode === "ai" && !aiPlan)}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
