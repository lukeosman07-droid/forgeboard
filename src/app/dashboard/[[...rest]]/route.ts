import { NextResponse, type NextRequest } from "next/server";
import { defaultWorkspaceSlug } from "@/lib/workspaces";

// The app used to live at /dashboard. Pages now sit under /w/<workspace>, so the
// old URLs (bookmarks, emails, Stripe return links, "Go to dashboard" buttons)
// forward to the same page in the workspace the user opened last.
export async function GET(request: NextRequest, { params }: RouteContext<"/dashboard/[[...rest]]">) {
  const { rest = [] } = await params;
  const slug = await defaultWorkspaceSlug();

  const url = request.nextUrl.clone();
  if (!slug) {
    // Signed in but in no workspace (they left or were removed from all of them).
    url.pathname = "/welcome";
    url.search = "";
  } else {
    url.pathname = ["/w", slug, ...rest.map(encodeURIComponent)].join("/");
  }
  return NextResponse.redirect(url);
}
