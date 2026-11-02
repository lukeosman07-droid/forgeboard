import { site } from "@/lib/site";

export default function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2 font-semibold text-white">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500 text-slate-950"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 17.5h7M17.5 14v7" />
        </svg>
      </span>
      <span className="text-lg tracking-tight">{site.name}</span>
    </a>
  );
}
