import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import NavAuth, { NavAuthFallback } from "@/components/NavAuth";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import About from "@/components/About";
import Footer from "@/components/Footer";

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
        <Problem />
        <Features />
        <HowItWorks />
        <Pricing />
        <About />
      </main>
      <Footer />
    </>
  );
}
