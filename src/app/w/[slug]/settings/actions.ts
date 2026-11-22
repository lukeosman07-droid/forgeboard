"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoAccount, passwordProblem, siteUrl } from "@/lib/account";
import { syncSubscription } from "@/lib/billing/stripe-sync";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cancelSubscriptionNow, hasLiveSubscription } from "@/server/billing";
import { rpcMessage } from "@/server/session";

export type SettingsState = { error?: string; message?: string };

const DEMO_LOCKED = "This is the shared demo account, so its email, password and existence are locked. Sign up for your own account to try this.";

// Every action starts here: a verified user and a client that acts as them,
// so Row Level Security decides what they can touch.
async function session() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/dashboard/settings");
  return { supabase, user: data.user };
}

/** True when `password` is the user's current password. */
async function passwordIsCorrect(supabase: Awaited<ReturnType<typeof session>>["supabase"], email: string, password: string) {
  if (!password) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

const ProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Please enter your name.").max(120, "That name is too long."),
  companyName: z.string().trim().max(120, "That company name is too long."),
});

export async function updateProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = ProfileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    companyName: formData.get("companyName") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const { supabase, user } = await session();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, company_name: parsed.data.companyName || null })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save your profile. Please try again." };

  refresh();
  return { message: "Profile saved." };
}

export async function changeEmail(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "That email address doesn't look right. Please check it." };

  const { supabase, user } = await session();
  if (isDemoAccount(user.email)) return { error: DEMO_LOCKED };
  if (parsed.data === user.email?.toLowerCase()) return { error: "That's already your email." };
  if (!user.email || !(await passwordIsCorrect(supabase, user.email, String(formData.get("password") ?? "")))) {
    return { error: "That's not your current password." };
  }

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard/settings` },
  );
  if (error) {
    if (error.code === "email_exists") return { error: "Another account already uses that email." };
    if (error.code === "over_email_send_rate_limit") return { error: "Too many attempts. Please wait a minute and try again." };
    return { error: "Couldn't start the email change. Please try again." };
  }
  return { message: `Almost done: open the confirmation link we sent to ${parsed.data}. Your email changes once you do.` };
}

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const { supabase, user } = await session();
  if (isDemoAccount(user.email)) return { error: DEMO_LOCKED };
  if (!user.email || !(await passwordIsCorrect(supabase, user.email, String(formData.get("current") ?? "")))) {
    return { error: "That's not your current password." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That's your current password. Choose a different one." };
    if (error.code === "weak_password") return { error: "That password is too weak or has appeared in a data breach. Choose another." };
    return { error: "Couldn't change your password. Please try again." };
  }

  // Sign out every other device, so a stolen session ends with the old password.
  await supabase.auth.signOut({ scope: "others" });
  return { message: "Password changed. Your other devices have been signed out." };
}

export async function deleteAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase, user } = await session();
  if (isDemoAccount(user.email)) return { error: DEMO_LOCKED };
  if (!user.email || !(await passwordIsCorrect(supabase, user.email, String(formData.get("password") ?? "")))) {
    return { error: "That's not your current password." };
  }

  // A workspace other people use needs a new owner first. (The database refuses
  // too; checking here means billing isn't cancelled for a deletion that fails.)
  const { data: owned } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("role", "owner");
  const ownedIds = (owned ?? []).map((m) => m.workspace_id as string);
  if (ownedIds.length > 0) {
    const { count } = await supabase
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .in("workspace_id", ownedIds)
      .neq("user_id", user.id);
    if (count) return { error: rpcMessage({ message: "transfer_ownership_first" }, "") };
  }

  // Stop billing first: never leave a subscription charging a deleted account.
  // Members can't read the stripe_* columns, so the service-role client reads
  // them for the workspaces this user owns (checked above with their own client).
  if (ownedIds.length > 0) {
    const admin = createAdminClient();
    if (!admin) return { error: "Billing isn't reachable right now. Please try again later." };
    const { data: billed } = await admin
      .from("workspaces")
      .select("id, stripe_subscription_id, subscription_status")
      .in("id", ownedIds);
    const live = (billed ?? []).filter(hasLiveSubscription);
    if (live.length > 0) {
      const stripe = getStripe();
      if (!stripe) return { error: "Billing isn't reachable right now, so your subscription couldn't be canceled. Please try again later." };
      try {
        for (const ws of live) {
          await cancelSubscriptionNow(stripe, ws.stripe_subscription_id!);
          await syncSubscription(stripe, admin, ws.stripe_subscription_id!, ws.id);
        }
      } catch (err) {
        console.error("Account deletion: couldn't cancel subscription", err);
        return { error: "We couldn't cancel your subscription, so nothing was deleted. Please try again or contact support." };
      }
    }
  }

  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    console.error("delete_own_account failed:", error);
    return { error: rpcMessage(error, "Couldn't delete your account. Please try again or contact support.") };
  }

  // The account is gone; this just clears the login cookies in this browser.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/login?notice=account-deleted");
}
