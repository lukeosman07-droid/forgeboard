"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colorOf } from "@/lib/work";

export function ProjectLink({ id, name, color }: { id: string; name: string; color: string }) {
  const href = `/dashboard/projects/${id}`;
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${
        active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colorOf(color).dot}`} />
      <span className="truncate">{name}</span>
    </Link>
  );
}
