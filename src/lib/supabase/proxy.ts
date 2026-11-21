import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { safeNext } from "@/lib/safe-next";

// Pages that need a signed-in user, and pages a signed-in user should skip.
// (/invite is left open: the page shows who invited you before asking you to log in.)
const PROTECTED_PREFIXES = ["/dashboard", "/w", "/welcome", "/checkout"];
const AUTH_PAGES = ["/login", "/signup"];

// Refreshes the Supabase session cookie on every request and handles auth redirects.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Don't put code between createServerClient and getClaims: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!isSignedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Come back to the page they asked for after logging in.
    return redirectTo("/login", pathname + request.nextUrl.search);
  }
  // The app used to live at /dashboard; it now lives at /w/<workspace>. Old links
  // (bookmarks, emails, Stripe return URLs, the redirect after login) open the
  // same page in the workspace used last. Done here rather than in a route so it
  // also works for in-app navigations.
  if (isSignedIn && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
    const slug = await lastWorkspaceSlug(supabase, String(data!.claims.sub));
    const url = request.nextUrl.clone();
    if (slug) {
      url.pathname = `/w/${slug}${pathname.slice("/dashboard".length)}`;
    } else {
      url.pathname = "/welcome";
      url.search = "";
    }
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (isSignedIn && AUTH_PAGES.includes(pathname)) {
    // Already logged in: skip the form and continue (e.g. on to checkout).
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    if (next) {
      const redirect = NextResponse.redirect(new URL(next, request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
    return redirectTo("/dashboard");
  }

  return response;
}

/** The workspace the user opened last, else their oldest one, else null. */
async function lastWorkspaceSlug(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("last_workspace_id").eq("id", userId).maybeSingle<{ last_workspace_id: string | null }>(),
    supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(slug, created_at)")
      .eq("user_id", userId)
      .overrideTypes<{ workspace_id: string; workspaces: { slug: string; created_at: string } | null }[], { merge: false }>(),
  ]);
  const list = (memberships ?? []).filter((m) => m.workspaces).sort((a, b) => a.workspaces!.created_at.localeCompare(b.workspaces!.created_at));
  return (list.find((m) => m.workspace_id === profile?.last_workspace_id) ?? list[0])?.workspaces?.slug ?? null;
}
