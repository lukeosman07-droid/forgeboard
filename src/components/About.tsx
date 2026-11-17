import Link from "next/link";
import { site } from "@/lib/site";

export default function About() {
  return (
    <section id="about" className="border-t border-white/5 bg-slate-900/40 py-20">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">About</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">Built for the way engineering teams work</h2>
        <p className="mt-4 text-lg text-slate-400">
          {site.name} is built by {site.builder} to keep the decisions, risks and action items from every meeting
          from getting lost. Questions or feedback?{" "}
          <Link href="/contact" className="font-medium text-orange-400 hover:text-orange-300">
            Get in touch
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
