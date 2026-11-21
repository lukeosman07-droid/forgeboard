import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Logo from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { InviteToken } from "@/server/schemas";
import AcceptInvite from "./accept-invite";

export const metadata: Metadata = { title: "Join a workspace – Forgeboard", robots: { index: false } };

// The link in an invite email. Anyone with the link sees who it's for and where
// it leads; accepting needs a login with the invited address.
export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b border-white/10 px-4 sm:px-8">
        <Logo href="/" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-8">
          <Suspense fallback={<p className="text-slate-400">Checking your invite…</p>}>
            <InviteContent params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

type Preview = { workspace_name: string; email: string; role: Exclude<Role, "owner"> };

async function InviteContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const valid = InviteToken.safeParse(token).success;
  const { data } = valid && supabase ? await supabase.rpc("invite_preview", { p_token: token }) : { data: null };
  const invite = (data as Preview[] | null)?.[0];

  if (!invite) {
    return (
      <>
        <h1 className="text-2xl font-bold text-white">This invite isn&apos;t valid</h1>
        <p className="mt-3 text-slate-400">
          It may have expired (invites last 7 days), been cancelled, or already been used. Ask the person who invited you
          to send a new one.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-orange-400 hover:text-orange-300">
          Go to your workspace
        </Link>
      </>
    );
  }

  const user = await getCurrentUser();
  const here = `/invite/${token}`;
  const role = ROLE_LABELS[invite.role].toLowerCase();

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Join {invite.workspace_name}</h1>
      <p className="mt-3 text-slate-300">
        You&apos;ve been invited to <span className="font-medium text-white">{invite.workspace_name}</span> on Forgeboard as{" "}
        {invite.role === "admin" ? "an" : "a"} {role}.
        {invite.role === "guest" && " Guests can see and comment on the projects shared with them."}
      </p>
      <p className="mt-2 text-sm text-slate-500">The invite was sent to {invite.email}.</p>

      {!user ? (
        <div className="mt-8 space-y-3">
          <Link
            href={`/signup?next=${encodeURIComponent(here)}`}
            className="block rounded-lg bg-orange-500 px-4 py-2.5 text-center font-semibold text-slate-950 hover:bg-orange-400"
          >
            Create an account
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(here)}`}
            className="block rounded-lg border border-white/15 px-4 py-2.5 text-center font-semibold text-white hover:bg-white/5"
          >
            I already have an account
          </Link>
          <p className="text-center text-xs text-slate-500">Use {invite.email} so the invite matches.</p>
        </div>
      ) : user.email?.toLowerCase() !== invite.email.toLowerCase() ? (
        <p role="alert" className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          You&apos;re logged in as {user.email}. This invite is for {invite.email}: log out, then log in or sign up with that
          address to accept it.
        </p>
      ) : (
        <AcceptInvite token={token} />
      )}
    </>
  );
}
