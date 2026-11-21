import "server-only";
import { Resend } from "resend";
import InviteEmail, { type InviteEmailProps } from "@/emails/invite";

// Transactional email through Resend. Until RESEND_API_KEY is set, nothing is
// sent and callers fall back to showing the link so it can be shared by hand.

let client: Resend | null = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/** "Forgeboard <invites@yourdomain.com>". The domain must be verified in Resend. */
function fromAddress() {
  return process.env.EMAIL_FROM || "Forgeboard <onboarding@resend.dev>";
}

export function emailIsConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/** Sends the invite. Returns false if email isn't set up or the send failed. */
export async function sendInviteEmail(to: string, props: InviteEmailProps): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `${props.inviterName} invited you to ${props.workspaceName} on Forgeboard`,
      react: InviteEmail(props),
    });
    if (error) console.error("Invite email failed:", error.name, error.message);
    return !error;
  } catch (err) {
    console.error("Invite email failed:", err);
    return false;
  }
}
