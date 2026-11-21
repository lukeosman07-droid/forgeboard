"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/server/members";

export default function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-8 space-y-3">
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // On success the action opens the workspace (or the shared project).
            const result = await acceptInvite(token);
            if (result?.error) setError(result.error);
          })
        }
        className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-orange-400 disabled:opacity-60"
      >
        {pending ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
