import { memo, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { post } from "../use-coach";
import { cx } from "./primitives";

const REMARK_PLUGINS = [remarkGfm];

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  const external = href !== undefined && /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault();
        if (external) void post("/open", { url: href });
      }}
    >
      {children}
    </a>
  );
}

const COMPONENTS: Components = { a: ExternalLink };

function count(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

export function completeMarkdown(text: string): string {
  const fences = count(text, "```");
  if (fences % 2 === 1) return `${text}\n\`\`\``;
  const lines = text.split("\n");
  const last = lines.at(-1) ?? "";
  let tail = "";
  if (count(last.replaceAll("```", ""), "`") % 2 === 1) tail += "`";
  if (count(last, "**") % 2 === 1) tail += "**";
  return text + tail;
}

export function splitBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let start = 0;
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    const next = lines[index + 1];
    if (!fenced && line.trim() === "" && next !== undefined && /^\S/.test(next) && index > start) {
      blocks.push(lines.slice(start, index).join("\n"));
      start = index + 1;
    }
  }
  blocks.push(lines.slice(start).join("\n"));
  return blocks;
}

const Block = memo(function Block({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
      {text}
    </Markdown>
  );
});

export const CoachMarkdown = memo(function CoachMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = splitBlocks(text);
  return (
    <div className={cx("coach-markdown min-w-0 text-[14px] leading-[1.6]", streaming && "coach-streaming")} dir="auto">
      {blocks.map((block, index) => (
        <Block key={index} text={streaming && index === blocks.length - 1 ? completeMarkdown(block) : block} />
      ))}
    </div>
  );
});
