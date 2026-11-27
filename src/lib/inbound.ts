import { createHmac, timingSafeEqual } from "node:crypto";

// Project inbox addresses and the signature on inbound-email webhooks.
//
// The mail provider (for example a Cloudflare Email Worker, see
// docs/INBOUND_EMAIL.md) POSTs the raw email to /api/inbound-email with:
//   x-forgeboard-timestamp: unix seconds
//   x-forgeboard-signature: v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with INBOUND_EMAIL_SECRET>
//   x-forgeboard-to:        the address it was delivered to (optional; else To/Cc are used)

/** Signatures older or newer than this are refused, so a captured request can't be replayed later. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Largest email accepted (Vercel caps request bodies at 4.5 MB). */
export const MAX_INBOUND_BYTES = 4 * 1024 * 1024;

export function signInbound(secret: string, timestamp: string, body: Uint8Array | string): string {
  const mac = createHmac("sha256", secret);
  mac.update(`${timestamp}.`);
  mac.update(body);
  return `v1=${mac.digest("hex")}`;
}

export function verifyInbound(
  secret: string,
  signature: string | null,
  timestamp: string | null,
  body: Uint8Array | string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature || !timestamp || !/^\d{9,11}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signInbound(secret, timestamp, body));
  const given = Buffer.from(signature.trim());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const ADDRESS = /(?:^|[^a-z0-9.+_-])p-([0-9a-f]{32})@/i;

/** The inbox token from the first address that is a project inbox. */
export function inboxTokenFrom(addresses: (string | null | undefined)[]): string | null {
  for (const address of addresses) {
    const match = address ? ADDRESS.exec(` ${address}`) : null;
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** p-<token>@<domain>, or null until INBOUND_EMAIL_DOMAIN is set. */
export function inboxAddress(token: string, domain = process.env.INBOUND_EMAIL_DOMAIN): string | null {
  const host = domain?.trim().toLowerCase();
  return host ? `p-${token}@${host}` : null;
}
