import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

// A page that crashes on purpose, so the browser tests can prove the custom
// error screen (and error monitoring) work. It only exists when the server is
// started with E2E_TEST_HOOKS=1; everywhere else it's a normal 404.
export default function TestErrorPage() {
  return (
    <Suspense>
      <Crash />
    </Suspense>
  );
}

async function Crash(): Promise<never> {
  await connection(); // decide per request, not at build time
  if (process.env.E2E_TEST_HOOKS !== "1") notFound();
  throw new Error("Test error thrown on purpose by /dashboard/test-error");
}
