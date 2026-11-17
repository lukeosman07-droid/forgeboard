import { withSentry } from "@/lib/monitoring/report";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Runs in the browser before the app becomes interactive.
// Starts error monitoring when NEXT_PUBLIC_SENTRY_DSN is set; otherwise does nothing.
withSentry((sentry) => sentry.init(sentryOptions));
