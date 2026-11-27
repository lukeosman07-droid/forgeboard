import "server-only";
import { Resend } from "resend";
import InviteEmail, { type InviteEmailProps } from "@/emails/invite";
import PaymentFailedEmail, { type PaymentFailedEmailProps } from "@/emails/payment-failed";
import NotificationEmail, { type NotificationEmailProps } from "@/emails/notification";
import DueDigestEmail, { type DueDigestEmailProps } from "@/emails/due-digest";
import TrialEndingEmail, { type TrialEndingEmailProps } from "@/emails/trial-ending";
import WeeklyReportEmail, { type WeeklyReportEmailProps } from "@/emails/weekly-report";

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

/** Tells a workspace owner their payment failed. Returns false if email isn't set up or the send failed. */
export async function sendPaymentFailedEmail(to: string, props: PaymentFailedEmailProps): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `Payment failed for ${props.workspaceName} on Forgeboard`,
      react: PaymentFailedEmail(props),
    });
    if (error) console.error("Payment-failed email failed:", error.name, error.message);
    return !error;
  } catch (err) {
    console.error("Payment-failed email failed:", err);
    return false;
  }
}

export type SendResult = "sent" | "failed" | "off";

async function send(to: string, subject: string, react: React.ReactElement, label: string): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return "off";
  try {
    const { error } = await resend.emails.send({ from: fromAddress(), to, subject, react });
    if (error) console.error(`${label} email failed:`, error.name, error.message);
    return error ? "failed" : "sent";
  } catch (err) {
    console.error(`${label} email failed:`, err);
    return "failed";
  }
}

/** One notification: assigned, mentioned, commented or status change. */
export function sendNotificationEmail(to: string, subject: string, props: NotificationEmailProps) {
  return send(to, subject, NotificationEmail(props), "Notification");
}

/** The daily list of overdue and due-soon tasks. */
export function sendDueDigestEmail(to: string, props: DueDigestEmailProps) {
  const n = props.tasks.length;
  return send(to, `${n} ${n === 1 ? "task" : "tasks"} due soon in ${props.workspaceName}`, DueDigestEmail(props), "Digest");
}

/** Warns a workspace owner that the free trial ends soon. */
export function sendTrialEndingEmail(to: string, props: TrialEndingEmailProps) {
  return send(to, `Your Forgeboard trial for ${props.workspaceName} ends ${props.endsOn}`, TrialEndingEmail(props), "Trial-ending");
}

/** A project's weekly AI report. */
export function sendWeeklyReportEmail(to: string, props: WeeklyReportEmailProps) {
  return send(to, `Weekly report: ${props.projectName} (week of ${props.weekOf})`, WeeklyReportEmail(props), "Weekly report");
}
