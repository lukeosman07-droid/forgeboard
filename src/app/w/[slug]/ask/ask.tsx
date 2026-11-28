"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useWorkspacePath } from "@/components/app/workspace-context";
import { sourcePath, type AskSource } from "@/lib/ask";

type Answer = { question: string; answer: string; sources: AskSource[] };

const KIND: Record<string, string> = { action_item: "Task", decision: "Decision", risk: "Risk", question: "Question" };

export default function Ask({ slug, available }: { slug: string; available: boolean }) {
  const path = useWorkspacePath();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean }>();
  const [answers, setAnswers] = useState<Answer[]>([]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) return;
    setAsking(true);
    setError(undefined);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: q }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ message: body.error ?? "Something went wrong. Please try again.", upgrade: body.code === "plan" || body.code === "ai_limit" });
        return;
      }
      setAnswers((a) => [{ question: q, answer: body.answer, sources: body.sources ?? [] }, ...a]);
      setQuestion("");
    } catch {
      setError({ message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setAsking(false);
    }
  }

  if (!available) {
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center">
        <p className="font-semibold text-white">Ask Forgeboard is on the Team and Business plans</p>
        <Link href={path("/billing")} className="mt-4 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-400">
          See plans
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="What did we decide about the bearing grout?"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-orange-500/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <button
          type="submit"
          disabled={asking || question.trim().length < 3}
          className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-50"
        >
          {asking ? "Looking…" : "Ask"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error.message}
          {error.upgrade && (
            <Link href={path("/billing")} className="ml-2 font-semibold text-orange-300 underline">
              See plans →
            </Link>
          )}
        </p>
      )}

      {answers.map((a, i) => (
        <article key={answers.length - i} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" aria-label="Answer">
          <p className="text-sm font-medium text-slate-400">{a.question}</p>
          <p className="mt-2 leading-relaxed text-slate-100">
            <Cited text={a.answer} sources={a.sources} />
          </p>
          {a.sources.length > 0 && (
            <ol className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm" aria-label="Sources">
              {a.sources.map((s) => (
                <li key={s.n} className="flex gap-2">
                  <span className="text-slate-500">[{s.n}]</span>
                  <Link href={path(sourcePath(s))} className="min-w-0 truncate text-orange-300 hover:text-orange-200">
                    {s.kind === "document" ? "Document" : s.kind === "rfi" ? "RFI" : s.kind === "submittal" ? "Submittal" : s.kind === "comment" ? "Comment" : (KIND[s.item_type ?? ""] ?? "Task")}: {s.title}
                  </Link>
                  <span className="shrink-0 text-slate-500">· {s.project_name}</span>
                </li>
              ))}
            </ol>
          )}
        </article>
      ))}
    </div>
  );
}

/** The answer with [S1] markers turned into links to the source. */
function Cited({ text, sources }: { text: string; sources: AskSource[] }) {
  const path = useWorkspacePath();
  const parts = text.split(/(\[S\d+\])/);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[S(\d+)\]$/.exec(part);
        const source = match ? sources.find((s) => s.n === Number(match[1])) : undefined;
        if (!source) return <Fragment key={i}>{part}</Fragment>;
        return (
          <Link
            key={i}
            href={path(sourcePath(source))}
            title={source.title}
            className="mx-0.5 rounded bg-orange-500/15 px-1 text-xs font-semibold text-orange-300 no-underline hover:bg-orange-500/25"
          >
            {source.n}
          </Link>
        );
      })}
    </>
  );
}
