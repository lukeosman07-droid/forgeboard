"use client";

import { Fragment } from "react";
import { usePeople } from "@/components/app/workspace-context";
import { parseMarkdown, type Inline } from "@/lib/markdown";
import { displayName } from "@/lib/people";

// Renders a comment's Markdown as React elements (never as HTML).
// Mentions show the person's current name.

export default function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`space-y-2 break-words text-sm leading-relaxed text-slate-200 ${className}`}>
      {blocks.map((block, i) =>
        block.kind === "paragraph" ? (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inlines nodes={line} />
              </Fragment>
            ))}
          </p>
        ) : block.ordered ? (
          <ol key={i} className="list-decimal space-y-0.5 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  const { byId } = usePeople();
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case "text":
            return <Fragment key={i}>{node.text}</Fragment>;
          case "bold":
            return (
              <strong key={i} className="font-semibold text-white">
                <Inlines nodes={node.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inlines nodes={node.children} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-orange-200">
                {node.text}
              </code>
            );
          case "link":
            return (
              <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="text-orange-300 underline underline-offset-2 hover:text-orange-200">
                <Inlines nodes={node.children} />
              </a>
            );
          case "mention": {
            const person = byId.get(node.id);
            return (
              <span key={i} className="rounded bg-orange-500/15 px-1 font-medium text-orange-200" data-mention={node.id}>
                @{person ? displayName(person) : node.name}
              </span>
            );
          }
        }
      })}
    </>
  );
}
