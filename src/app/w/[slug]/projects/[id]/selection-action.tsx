"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/work/ui";

// Wraps text (a captured document). Highlighting part of it shows a small
// "Draft RFI" button next to the selection.
export default function SelectionAction({ onAction, children }: { onAction: (text: string) => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ text: string; top: number; left: number } | null>(null);

  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || text.length < 10 || !box.current?.contains(sel.anchorNode)) return setPick(null);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const outer = box.current.getBoundingClientRect();
      setPick({ text: text.slice(0, 8000), top: rect.bottom - outer.top + 6, left: Math.max(0, rect.left - outer.left) });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  return (
    <div ref={box} className="relative">
      {children}
      {pick && (
        <button
          type="button"
          // Keep the selection: act on mousedown, before the click clears it.
          onMouseDown={(e) => {
            e.preventDefault();
            onAction(pick.text);
            setPick(null);
          }}
          style={{ top: pick.top, left: pick.left }}
          className="absolute z-20 flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-slate-950 shadow-lg hover:bg-orange-400"
        >
          <Icon name="sparkles" className="h-3.5 w-3.5" /> Draft RFI from selection
        </button>
      )}
    </div>
  );
}
