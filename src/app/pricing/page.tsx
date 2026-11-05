import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import NavAuth, { NavAuthFallback } from "@/components/NavAuth";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import CheckoutNotice from "./checkout-notice";

export const metadata: Metadata = { title: "Pricing – Forgeboard" };

// Standalone pricing page (the in-app "Upgrade" links point here).
export default function PricingPage() {
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
        {/* Suspense because the notice reads the URL (?checkout=canceled) */}
        <Suspense>
          <CheckoutNotice />
        </Suspense>
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
