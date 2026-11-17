import { Suspense } from "react";
import Footer from "@/components/Footer";
import NavAuth, { NavAuthFallback } from "@/components/NavAuth";
import Navbar from "@/components/Navbar";

// Shared frame for /terms, /privacy, /security and /contact.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar
        auth={
          <Suspense fallback={<NavAuthFallback />}>
            <NavAuth />
          </Suspense>
        }
        mobileAuth={
          <Suspense fallback={<NavAuthFallback mobile />}>
            <NavAuth mobile />
          </Suspense>
        }
      />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">{children}</div>
      </main>
      <Footer />
    </>
  );
}
