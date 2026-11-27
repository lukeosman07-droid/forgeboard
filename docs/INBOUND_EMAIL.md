# Project inbox: receiving email

Each project can have an address like `p-3f9c…@inbox.your-domain.com`. Mail sent
there shows up in the project's **AI Notes → Project inbox** within seconds, ready
to read with AI.

Forgeboard doesn't receive mail itself. A mail provider receives it and POSTs the
raw message to `/api/inbound-email`, signed with a shared secret. Any provider
that can run a little code on incoming mail works. Cloudflare Email Routing is
free and is described here.

## What the webhook expects

`POST https://<your app>/api/inbound-email`

| Header | Value |
| --- | --- |
| `Content-Type` | `message/rfc822` |
| `x-forgeboard-timestamp` | Unix time in seconds |
| `x-forgeboard-signature` | `v1=` + hex HMAC-SHA256 of `<timestamp>.<raw body>`, keyed with `INBOUND_EMAIL_SECRET` |
| `x-forgeboard-to` | The address it was delivered to (optional; otherwise the To and Cc headers are used) |

The body is the raw email (RFC 822), up to 4 MB. Signatures more than 5 minutes
old are refused. The route answers `201` when the email was filed, `202` when it
was not accepted (unknown address, sender not allowed, plan without the inbox),
and `401` for a bad signature.

Who may send: people in the workspace who can see the project. The project's
manager can also allow outside senders. Email attachments are listed in the text
but not imported.

## Setting it up with Cloudflare (free)

1. Add a domain to Cloudflare (or a subdomain such as `inbox.your-domain.com`)
   and turn on **Email Routing** for it.
2. In Vercel, set `INBOUND_EMAIL_SECRET` (a long random string) and
   `INBOUND_EMAIL_DOMAIN` (the domain from step 1), then redeploy.
3. Create an **Email Worker** with the same secret as a Worker secret named
   `INBOUND_EMAIL_SECRET`, and the code below.
4. In Email Routing, add a **catch-all** rule: send to Worker → the worker.

```js
export default {
  async email(message, env) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.INBOUND_EMAIL_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = new Uint8Array(timestamp.length + 1 + raw.length);
    signed.set(new TextEncoder().encode(`${timestamp}.`), 0);
    signed.set(raw, timestamp.length + 1);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
    const signature = "v1=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
    const res = await fetch("https://forgeboard-two.vercel.app/api/inbound-email", {
      method: "POST",
      headers: { "Content-Type": "message/rfc822", "x-forgeboard-timestamp": timestamp, "x-forgeboard-signature": signature, "x-forgeboard-to": message.to },
      body: raw,
    });
    if (res.status >= 500) message.setReject("Temporary problem, try again later");
  },
};
```
