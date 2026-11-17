// Building blocks for the legal and trust pages, so they all read the same.

/** Page heading. `draft` shows the banner that the text still needs a lawyer. */
export function LegalHeader({ title, intro, draft = true }: { title: string; intro: string; draft?: boolean }) {
  return (
    <header>
      {draft && (
        <p
          role="note"
          className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200"
        >
          DRAFT: needs legal review. This text is a placeholder and is not yet a binding agreement.
        </p>
      )}
      <h1 className="text-4xl font-bold tracking-tight text-white">{title}</h1>
      <p className="mt-4 text-lg text-slate-400">{intro}</p>
    </header>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-orange-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** An email link, or a plain note when the address hasn't been set up yet. */
export function EmailLink({ address, fallback = "an address we'll publish here before launch" }: { address: string | null; fallback?: string }) {
  if (!address) return <span>{fallback}</span>;
  return (
    <a href={`mailto:${address}`} className="font-medium text-orange-400 hover:text-orange-300">
      {address}
    </a>
  );
}
