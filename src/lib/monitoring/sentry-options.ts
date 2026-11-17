// Shared Sentry settings for the server and the browser.
// Set NEXT_PUBLIC_SENTRY_DSN to turn error monitoring on; without it nothing is sent.
export const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentryOptions = {
  dsn: sentryDsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Errors only: no performance tracing, no session replay.
  tracesSampleRate: 0,
  // Never attach emails, IP addresses, cookies or request bodies. We set the user ID ourselves.
  sendDefaultPii: false,
};
