import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { removeStaleUploads } from "@/server/cleanup";
import { deliverNotificationEmails, sendDueDigests, sendTrialWarnings } from "@/server/deliver";
import { sendWeeklyReports } from "@/server/weekly-reports";

// Weekly reports are written one project at a time.
export const maxDuration = 300;

// GET /api/cron/daily
// Vercel Cron calls this once a day with "Authorization: Bearer $CRON_SECRET".
// It sends any notification emails still queued, the due-date digests and the
// trial-ending warnings; on Mondays (UTC) the weekly AI reports; and it clears
// out uploads that never finished. Each job records what it did, so a second
// run on the same day sends nothing new.
//
// Vercel Hobby runs crons once a day, so by default every digest goes out on
// that run. On a plan with hourly crons, schedule "/api/cron/daily?hourly=1"
// every hour instead and each person gets theirs at their chosen local hour.

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const notifications = await deliverNotificationEmails(500);
  const hourly = request.nextUrl.searchParams.get("hourly") === "1";
  const digests = await sendDueDigests(now, !hourly);
  const trialWarnings = await sendTrialWarnings(now);
  const weeklyReports = await sendWeeklyReports(now);
  const staleUploads = await removeStaleUploads(now);
  return NextResponse.json({ notifications, digests, trialWarnings, weeklyReports, staleUploads });
}
