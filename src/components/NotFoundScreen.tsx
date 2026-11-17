import Link from "next/link";

// Shared by the site-wide and in-app "page not found" screens.
export default function NotFoundScreen({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Page not found</h1>
      <p className="mt-3 max-w-md text-slate-400">{text}</p>
      <Link href={href} className="mt-8 rounded-lg bg-orange-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-orange-400">
        {label}
      </Link>
    </div>
  );
}
