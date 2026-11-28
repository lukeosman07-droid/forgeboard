"use client";

import { useEffect } from "react";

// Marks each landing block with .fb-on the first time its top comes into
// view; the animations themselves are in globals.css. Nothing is hidden until
// this has run, so the page reads fine without JavaScript.
//
// A position check on scroll rather than an IntersectionObserver: a fast
// fling or a jump to an anchor can carry a block past the viewport between
// observer callbacks, and then it would stay hidden. Here anything at or
// above the reveal line is shown, however it got there.
const TARGETS = ".fb-reveal, .fb-window, .fb-stagger";

export default function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pending = new Set(document.querySelectorAll<HTMLElement>(TARGETS));
    let timer: number | undefined;

    const check = () => {
      timer = undefined;
      const line = window.innerHeight * 0.88;
      for (const el of pending) {
        if (el.getBoundingClientRect().top < line) {
          el.classList.add("fb-on");
          pending.delete(el);
        }
      }
      if (pending.size === 0) stop();
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(check, 60);
    };
    const stop = () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };

    document.documentElement.classList.add("fb-armed");
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    check();

    return () => {
      stop();
      window.clearTimeout(timer);
      document.documentElement.classList.remove("fb-armed");
    };
  }, []);

  return null;
}
