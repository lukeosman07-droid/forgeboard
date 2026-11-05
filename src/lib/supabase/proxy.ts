import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { safeNext } from "@/lib/safe-next";

// Pages that need a signed-in user, and pages a signed-in user should skip.
const PROTECTED_PREFIXES = ["/dashboard", "/checkout"];
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
