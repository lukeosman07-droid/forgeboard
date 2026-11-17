"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report";

// Last resort: shown when the root layout itself fails. It replaces the whole
// document, so it can't use the site's styles and carries its own.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <title>Something went wrong – Forgeboard</title>
        <div>
          <h1 style={{ fontSize: "1.75rem", margin: 0, color: "#fff" }}>Forgeboard hit an error</h1>
          <p style={{ color: "#94a3b8", maxWidth: "28rem" }}>Your work is saved. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1rem",
              padding: "0.625rem 1.25rem",
              border: 0,
              borderRadius: "0.5rem",
              background: "#f97316",
              color: "#020617",
              fontWeight: 600,
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
