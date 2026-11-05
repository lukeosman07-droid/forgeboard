import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const primary =
  "rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400";
const secondary = "text-sm text-slate-300 transition hover:text-white";

// Navbar buttons that depend on whether someone is logged in.
// Rendered on the server inside a <Suspense> boundary (see Navbar).
export default async function NavAuth({ mobile = false }: { mobile?: boolean }) {
  const user = await getCurrentUser();

  if (mobile) {
    return user ? (
      <Link href="/dashboard" className={`mt-2 block text-center ${primary} py-2.5`}>
        Dashboard
      </Link>
    ) : (
      <div className="mt-2 space-y-2">
        <Link href="/login" className="block py-3 text-slate-300 hover:text-white">
          Log in
        </Link>
        <Link href="/signup" className={`block text-center ${primary} py-2.5`}>
          Get Started
        </Link>
      </div>
    );
  }

  return user ? (
    <Link href="/dashboard" className={primary}>
      Dashboard
    </Link>
  ) : (
    <>
      <Link href="/login" className={secondary}>
        Log in
      </Link>
      <Link href="/signup" className={primary}>
        Get Started
      </Link>
    </>
  );
}

// Same-size placeholder while the login check streams in (avoids layout jump).
export function NavAuthFallback({ mobile = false }: { mobile?: boolean }) {
  if (mobile) return <div className="mt-2 h-24" aria-hidden />;
  return <div className="h-9 w-44" aria-hidden />;
}
