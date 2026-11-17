import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The browser may only talk to this site, our Supabase project, Stripe and Sentry.
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseSources = supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace(/^http/, "ws")] : [];

const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts to hydrate statically rendered pages. A nonce
  // would remove 'unsafe-inline' but forces every page to render per request.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src ${["'self'", ...supabaseSources, "https://*.sentry.io", ...(isDev ? ["ws:"] : [])].join(" ")}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  // Checkout and the billing portal are form posts that redirect to Stripe.
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

function originOf(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export default nextConfig;
