import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { BUCKET, SIGNED_URL_SECONDS, opensInBrowser } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

// GET /api/files/<attachment id>?page=N
// Opens a file through a fresh signed link that lasts 5 minutes, so a link
// copied out of the page soon stops working. Row Level Security decides
// whether the person may see it (a guest only sees shared projects).
// Images and PDFs open in the browser (PDFs at the page); everything else
// downloads, so an uploaded file never renders as a web page.

const Query = z.object({ page: z.coerce.number().int().min(1).max(100000).optional() });

export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));

  const { data: file } = await supabase
    .from("attachments")
    .select("storage_path, name, mime_type")
    .eq("id", id)
    .eq("status", "ready")
    .maybeSingle<{ storage_path: string; name: string; mime_type: string }>();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const inline = opensInBrowser(file.mime_type);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS, inline ? undefined : { download: file.name });
  if (error || !data) return new NextResponse("Couldn't open the file", { status: 502 });

  const page = Query.safeParse({ page: request.nextUrl.searchParams.get("page") ?? undefined });
  const target = inline && file.mime_type === "application/pdf" && page.success && page.data.page ? `${data.signedUrl}#page=${page.data.page}` : data.signedUrl;
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
