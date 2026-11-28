import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import NavAuth, { NavAuthFallback } from "@/components/NavAuth";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/landing/scroll-reveal";
import { Documents, FinalCta, Hero, ModuleIndex, Problem, Team, Trust, Workflows } from "@/components/landing/sections";

export default function Home() {
  return (
    <>
      {/* The login check reads cookies, so it streams in; the rest of the page stays static. */}
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
        <Hero />
        <ModuleIndex />
        <Problem />
        <Workflows />
        <Team />
        <Documents />
        <Trust />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
      <ScrollReveal />
    </>
  );
}
