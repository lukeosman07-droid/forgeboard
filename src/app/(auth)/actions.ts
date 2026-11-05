"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MISSING_ENV_MESSAGE } from "@/lib/supabase/env";
import { safeNext } from "@/lib/safe-next";

export type AuthFormState = {
  error?: string;
  message?: string;
  // Set on success when the user should continue somewhere specific (like checkout).
  // The form does a full page load there, because it may be an API route.
  redirectTo?: string;
  // Echo back what the user typed (never the password) so the form isn't wiped on error.
  values?: { email?: string; fullName?: string; companyName?: string };
};

// Turns Supabase error codes into messages a person can act on.
function friendlyError(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match. Check for typos and try again.";
    case "email_not_confirmed":
      return "Please confirm your email first. Check your inbox for the confirmation link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try logging in instead.";
    case "weak_password":
      return "That password is too weak. Use at least 8 characters with a mix of letters and numbers.";
    case "email_address_invalid":
      return "That email address doesn't look right. Please check it.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a minute and try again.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "New sign-ups are turned off right now.";
    case "user_banned":
      return "This account has been disabled.";
  }
  if (error.status && error.status >= 500) {
    return "Our login service is having trouble. Please try again in a moment.";
  }
  return error.message || "Something went wrong. Please try again.";
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };

  if (!email || !password) return { error: "Enter your email and password.", values };

  const supabase = await createClient();
  if (!supabase) return { error: MISSING_ENV_MESSAGE, values };

  let error;
  try {
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    return { error: "Couldn't reach the login service. Check your internet connection and try again.", values };
  }
  if (error) return { error: friendlyError(error), values };

  const next = safeNext(formData.get("next"));
  if (next) return { redirectTo: next, values };
  redirect("/dashboard");
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = field(formData, "fullName");
  const companyName = field(formData, "companyName");
  const values = { email, fullName, companyName };

  if (!fullName) return { error: "Please enter your name.", values };
  if (!email) return { error: "Please enter your email.", values };
  if (password.length < 8) return { error: "Your password needs at least 8 characters.", values };

  const supabase = await createClient();
  if (!supabase) return { error: MISSING_ENV_MESSAGE, values };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Only these two fields are copied into the profile by the database trigger.
        data: { full_name: fullName, company_name: companyName || null },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
  } catch {
    return { error: "Couldn't reach the sign-up service. Check your internet connection and try again.", values };
  }

  const { data, error } = result;
  if (error) return { error: friendlyError(error), values };

  // With "Confirm email" on, Supabase hides whether an email is taken by returning
  // a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { error: "An account with this email already exists. Try logging in instead.", values };
  }

  // No session means Supabase is waiting for the user to confirm their email.
  if (!data.session) {
    return { message: "Check your inbox: we sent you a link to confirm your email.", values };
  }

  const next = safeNext(formData.get("next"));
  if (next) return { redirectTo: next, values };
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}
