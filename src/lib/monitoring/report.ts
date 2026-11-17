import { sentryDsn } from "./sentry-options";

type SentrySdk = typeof import("@sentry/nextjs");

// Browser-side access to Sentry. The SDK is downloaded only when a DSN is set,
// so with monitoring off it adds nothing to page load.
export function withSentry(use: (sentry: SentrySdk) => void) {
  if (!sentryDsn) return;
  void import("@sentry/nextjs").then(use);
}

/** Logs an error and, when monitoring is on, sends it to Sentry. */
export function reportError(error: unknown) {
  console.error(error);
  withSentry((sentry) => sentry.captureException(error));
}
