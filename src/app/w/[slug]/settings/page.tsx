import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isDemoAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { DeleteAccountForm, EmailForm, PasswordForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings – Forgeboard" };

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been changed and your other devices were signed out.",
};

export default function SettingsPage({ searchParams }: PageProps<"/w/[slug]/settings">) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-slate-400">Your profile, login details and account.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60" />}>
        <SettingsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsContent({ searchParams }: { searchParams: PageProps<"/w/[slug]/settings">["searchParams"] }) {
  const { notice } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login?next=/dashboard/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_name, stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "full_name" | "company_name" | "stripe_subscription_id">>();

  const demo = isDemoAccount(user.email);
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <>
      {noticeText && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {noticeText}
        </p>
      )}
      {demo && (
        <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          You&apos;re using the shared demo account. Its email and password are locked and it can&apos;t be deleted.
        </p>
      )}

      <Card title="Profile" text="Shown to you in the sidebar and on your tasks.">
        <ProfileForm fullName={profile?.full_name ?? ""} companyName={profile?.company_name ?? ""} />
      </Card>

      <Card title="Email" text="We send a confirmation link to the new address before anything changes.">
        <EmailForm email={user.email ?? ""} locked={demo} />
      </Card>

      <Card title="Password" text="Changing it signs you out everywhere else.">
        <PasswordForm locked={demo} />
      </Card>

      <Card title="Delete account" text="Remove your account and all of its data from Forgeboard." danger>
        <DeleteAccountForm locked={demo} hasSubscription={!!profile?.stripe_subscription_id} />
      </Card>
    </>
  );
}

function Card({ title, text, danger = false, children }: { title: string; text: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border bg-slate-900/60 p-6 ${danger ? "border-red-500/25" : "border-white/10"}`}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
