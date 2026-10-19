import { ImageIcon, ImageOff } from "lucide-react";
import { memo, type ReactNode, useState } from "react";
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

export type ImageSource =
  | { kind: "local"; src: string; path: string }
  | { kind: "remote"; src: string; host: string }
  | { kind: "blocked" };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function decodedPath(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

export function imageSource(src: string | undefined): ImageSource {
  const value = (src ?? "").trim();
  if (!value || value.startsWith("//")) return { kind: "blocked" };
  if (SCHEME.test(value)) {
    if (!/^https:\/\//i.test(value)) return { kind: "blocked" };
    try {
      const url = new URL(value);
      return { kind: "remote", src: url.href, host: url.hostname.replace(/^www\./, "") };
    } catch {
      return { kind: "blocked" };
    }
  }
  const path = decodedPath(value);
  return { kind: "local", src: `/file?path=${encodeURIComponent(path)}`, path };
}

function ImageNote({ text }: { text: string }) {
  return (
    <span className="my-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <ImageOff aria-hidden className="size-3.5 shrink-0" />
      <span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">
        {text}
      </span>
    </span>
  );
}

function AnswerImage({ src, alt }: { src?: string; alt?: string }) {
  const source = imageSource(src);
  const [allowed, setAllowed] = useState(false);
  const [failed, setFailed] = useState(false);
  const caption = alt?.trim() ?? "";
  const name = caption || "image";
  if (source.kind === "blocked") return <ImageNote text={`${caption ? `${caption}: ` : ""}image link blocked`} />;
  if (source.kind === "remote" && !allowed) {
    return (
      <button
        type="button"
        onClick={() => setAllowed(true)}
        aria-label={`Image from ${source.host}${caption ? `, ${caption}` : ""}. Load`}
        title={source.src}
        className="my-1 flex max-w-full items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-start text-[12.5px] text-muted-foreground transition-colors duration-100 hover:bg-muted"
      >
        <ImageIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          Image from <bdi>{source.host}</bdi>
        </span>
        <span className="shrink-0 font-medium text-foreground">Load</span>
      </button>
    );
  }
  if (failed) return <ImageNote text={`Couldn't load ${caption || "this image"}`} />;
  return (
    <span className="my-2 flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        aria-label={`Open ${name} full size`}
        onClick={() =>
          void (source.kind === "local"
            ? post("/open-image", { path: source.path })
            : post("/open", { url: source.src }))
        }
        className="max-w-full rounded-lg"
      >
        <img
          src={source.src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="block max-h-[360px] max-w-full min-h-6 min-w-6 rounded-lg border border-border object-contain"
        />
      </button>
      {caption && (
        <span dir="auto" className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
          {caption}
        </span>
      )}
    </span>
  );
}

const COMPONENTS: Components = { a: ExternalLink, img: AnswerImage };

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
