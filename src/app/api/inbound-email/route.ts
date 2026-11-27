// Inbound email webhook. It uses the service-role client because the mail
// provider isn't a signed-in user: after this route has verified the
// provider's signature, receive_inbound_email() (callable only with the
// service role) decides in the database whether the sender may post to that
// project and files the email as a document.

import { NextResponse, type NextRequest } from "next/server";
import { parseEmail } from "@/lib/read-file";
import { MAX_INBOUND_BYTES, inboxTokenFrom, verifyInbound } from "@/lib/inbound";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Answers are short and the same for "no such inbox" and "not allowed", so
// the webhook can't be used to probe which addresses exist. A 2xx tells the
// provider not to retry; only server faults ask for a retry.
const done = (status: number, message: string) => NextResponse.json({ message }, { status });

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return done(503, "Inbound email isn't set up.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_INBOUND_BYTES) return done(413, "Email too large.");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_INBOUND_BYTES) return done(413, "Email too large.");

  if (!verifyInbound(secret, request.headers.get("x-forgeboard-signature"), request.headers.get("x-forgeboard-timestamp"), body)) {
    return done(401, "Bad signature.");
  }

  let email;
  try {
    email = await parseEmail(body);
  } catch {
    return done(202, "Couldn't read that email.");
  }
  const headerTo = request.headers.get("x-forgeboard-to");
  const raw = new TextDecoder().decode(body.slice(0, 64 * 1024));
  const headerLines = raw.split(/\r?\n\r?\n/)[0]?.split(/\r?\n/).filter((l) => /^(to|cc|delivered-to|x-original-to):/i.test(l)) ?? [];
  const token = inboxTokenFrom([headerTo, ...headerLines]);
  if (!token || !email.from) return done(202, "Not accepted.");

  const admin = createAdminClient();
  if (!admin) return done(503, "Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  const { data, error } = await admin.rpc("receive_inbound_email", {
    p_token: token,
    p_from: email.from,
    p_subject: email.subject,
    p_text: email.text || "(empty email)",
  });
  if (error) {
    console.error("receive_inbound_email failed:", error);
    return done(500, "Couldn't file the email.");
  }
  const result = data?.[0] as { accepted: boolean; reason: string; document_id: string | null } | undefined;
  if (!result?.accepted) {
    console.info("Inbound email not accepted:", result?.reason);
    return done(202, "Not accepted.");
  }
  return done(201, "Filed.");
}
