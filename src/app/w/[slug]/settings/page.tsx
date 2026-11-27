import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isDemoAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { emailIsConfigured } from "@/lib/email";
import { getWorkspace } from "@/lib/workspaces";
import { getNotificationPrefs } from "@/server/notifications";
import NotificationForm from "./notification-form";
import { DeleteAccountForm, DeleteWorkspaceForm, EmailForm, PasswordForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings – Forgeboard" };

const NOTICES: Record<string, string> = {
  "password-updated": "Your password has been changed and your other devices were signed out.",
};

export default function SettingsPage({ params, searchParams }: PageProps<"/w/[slug]/settings">) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-slate-400">Your profile, login details, notifications, workspace data and account.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-slate-900/60" />}>
        <SettingsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsContent({ params, searchParams }: PageProps<"/w/[slug]/settings">) {
  const [{ slug }, { notice }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) redirect("/login?next=/dashboard/settings");

  const [{ data: profile }, access, notificationPrefs] = await Promise.all([
    supabase.from("profiles").select("full_name, company_name").eq("id", user.id).maybeSingle<Pick<Profile, "full_name" | "company_name">>(),
    getWorkspace(slug),
    getNotificationPrefs(slug),
  ]);
  const workspace = access?.workspace;
  const isOwner = access?.role === "owner";
  const subscribed = Boolean(workspace && workspace.plan !== "trial" && workspace.subscription_status && workspace.subscription_status !== "canceled");

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

      {workspace && notificationPrefs && (
        <Card id="notifications" title="Notifications" text={`What you hear about in ${workspace.name}, in the app and by email.`}>
          <NotificationForm slug={workspace.slug} initial={notificationPrefs.prefs} timeZone={notificationPrefs.timeZone} emailOn={emailIsConfigured()} />
        </Card>
      )}

      {workspace && access?.isAdmin && (
        <Card title="Export data" text="Download your data at any time, including while the workspace is read-only.">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/w/${workspace.slug}/export`}
              download
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
            >
              Export workspace (ZIP of CSV files)
            </a>
            <span className="text-xs text-slate-500">Each project also has its own CSV export on its overview.</span>
          </div>
        </Card>
      )}

      {workspace && isOwner && (
        <Card title="Delete workspace" text={`Remove "${workspace.name}" and every project, task, note and comment in it.`} danger>
          <DeleteWorkspaceForm slug={workspace.slug} name={workspace.name} locked={demo} subscribed={subscribed} />
        </Card>
      )}

      <Card title="Delete account" text="Remove your account and all of its data from Forgeboard." danger>
        <DeleteAccountForm locked={demo} hasSubscription={subscribed && isOwner} />
      </Card>
    </>
  );
}

function Card({ id, title, text, danger = false, children }: { id?: string; title: string; text: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`rounded-2xl border bg-slate-900/60 p-6 ${danger ? "border-red-500/25" : "border-white/10"}`}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
