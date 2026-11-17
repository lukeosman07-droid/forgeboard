import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// Second kind of email link: /auth/confirm?token_hash=...&type=recovery&next=/reset-password
// Unlike /auth/callback it works when the email is opened on a different device or
// browser than the one that asked for it. To use it, point the Supabase email
// templates at this route (see docs/CHANGELOG.md, Phase 0 manual steps).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next")) ?? (type === "recovery" ? "/reset-password" : "/dashboard");

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = (await supabase?.auth.verifyOtp({ token_hash: tokenHash, type })) ?? { error: true };
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
