import type { Instrumentation } from "next";
import { sentryDsn, sentryOptions } from "@/lib/monitoring/sentry-options";

// Server-side error monitoring. Sentry is loaded only when NEXT_PUBLIC_SENTRY_DSN
// is set, so with monitoring off the server never imports it.

// Runs once when the server starts.
export async function register() {
  if (!sentryDsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryOptions);
}

// Reports errors thrown while rendering pages or running routes and server actions.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!sentryDsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
