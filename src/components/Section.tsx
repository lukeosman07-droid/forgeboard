import type { ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow: string;
  title: string;
  intro?: string;
  className?: string;
  children: ReactNode;
};

/** Shared wrapper so every section has the same spacing and heading style. */
export default function Section({ id, eyebrow, title, intro, className = "", children }: Props) {
  return (
    <section id={id} className={`py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 text-lg text-slate-400">{intro}</p>}
        </div>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}
