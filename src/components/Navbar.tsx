"use client";

import { useState } from "react";
import Logo from "./Logo";
import { navLinks } from "@/lib/site";

// `auth` and `mobileAuth` are the server-rendered Log in / Get Started / Dashboard buttons.
export default function Navbar({ auth, mobileAuth }: { auth: React.ReactNode; mobileAuth: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <div className="flex items-center gap-6">{auth}</div>
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-slate-300 hover:bg-white/5 hover:text-white md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Kept mounted (just hidden) so the server-rendered buttons don't reload on each toggle. */}
      <div id="mobile-menu" hidden={!open} className="border-t border-white/10 px-4 pb-4 md:hidden">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={close}
            className="block py-3 text-slate-300 hover:text-white"
          >
            {link.label}
          </a>
        ))}
        {mobileAuth}
      </div>
    </header>
  );
}
