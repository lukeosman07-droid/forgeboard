import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { CreateWorkspaceForm } from "@/components/app/workspace-switcher";

export const metadata: Metadata = { title: "Create a workspace – Forgeboard" };

// Where someone lands when they belong to no workspace: they left or were
// removed from every one. New sign-ups never see this, because each account
// starts with its own workspace.
export default function WelcomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b border-white/10 px-4 sm:px-8">
        <Logo href="/" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60">
          <p className="px-6 pt-6 text-sm text-slate-400">
            You&apos;re not in any workspace right now. Create one, or open an invite link from a teammate.
          </p>
          <CreateWorkspaceForm />
        </div>
      </main>
    </div>
  );
}
