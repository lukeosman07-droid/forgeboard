"use client";

import { useTransition } from "react";
import { dismissChecklist } from "@/server/workspace";

export default function DismissChecklist({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await dismissChecklist(slug)))}
      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
    >
      Dismiss
    </button>
  );
}
