import {
  Check,
  ChevronRight,
  CircleSlash,
  FileText,
  FolderSearch,
  ListChecks,
  MessageCircleQuestion,
  NotebookPen,
  Plug,
  Search,
  SquareTerminal,
  Users,
  X,
} from "lucide-react";
import { type ComponentType, useId, useState } from "react";

import type { Step } from "../state";
import { cx } from "./primitives";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function iconFor(name: string): Icon {
  if (name === "mcp__meeting__live_transcript") return FileText;
  if (name === "mcp__meeting__meeting_info") return Users;
  if (name.startsWith("mcp__meeting__")) return NotebookPen;
  if (name === "Read") return FileText;
  if (name === "Grep") return Search;
  if (name === "Glob") return FolderSearch;
  if (name === "Bash") return SquareTerminal;
  if (name === "AskUserQuestion") return MessageCircleQuestion;
  if (name === "TodoWrite") return ListChecks;
  return Plug;
}

function stepsSummary(steps: readonly Step[]): string {
  const failed = steps.filter((step) => step.status === "failed").length;
  const base = steps.length === 1 ? steps[0]?.label ?? "1 step" : `${steps.length} steps`;
  return failed > 0 ? `${base} · ${failed} failed` : base;
}

export function Steps({ steps }: { steps: readonly Step[] }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  if (steps.length === 0) return null;
  const [only] = steps;
  if (steps.length === 1 && only) {
    return (
      <ul className="-ms-1 mb-1.5" data-testid="steps">
        <StepRow step={only} />
      </ul>
    );
  }
  return (
    <div className="mb-1.5" data-testid="steps">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={regionId}
        className="-ms-1 flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-[12px] text-muted-foreground transition-colors duration-100 hover:text-foreground"
      >
        <ChevronRight
          aria-hidden
          className={cx("size-3 shrink-0 transition-transform duration-150", open ? "rotate-90" : "rtl:-scale-x-100")}
        />
        <span dir="auto" className="truncate">
          {stepsSummary(steps)}
        </span>
      </button>
      <div
        id={regionId}
        className={cx(
          "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          <ul className="mt-1 ms-1.5 flex flex-col gap-0.5 border-s border-border ps-2.5">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const Icon = iconFor(step.name);
  const expandable = Boolean(step.detail || step.output);
  const status =
    step.status === "failed" ? (
      <X aria-label="Failed" className="size-3 shrink-0 text-destructive" />
    ) : step.status === "stopped" ? (
      <CircleSlash aria-label="Stopped" className="size-3 shrink-0 text-muted-foreground" />
    ) : step.status === "ok" ? (
      <Check aria-label="Done" className="size-3 shrink-0 text-muted-foreground/70" />
    ) : null;
  return (
    <li data-testid="step" data-status={step.status}>
      <button
        type="button"
        onClick={expandable ? () => setOpen((value) => !value) : undefined}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? regionId : undefined}
        className={cx(
          "flex w-full items-center gap-1.5 rounded px-1 py-[3px] text-left text-[12px] text-muted-foreground",
          expandable ? "transition-colors duration-100 hover:bg-muted hover:text-foreground" : "cursor-default",
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0 opacity-70" />
        <span className={cx("min-w-0 flex-1 truncate", step.status === "running" && "coach-sheen")}>
          {step.status === "running" ? step.activeLabel : step.label}
        </span>
        {status}
      </button>
      {expandable && (
        <div
          id={regionId}
          className={cx(
            "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          inert={!open}
        >
          <div className="overflow-hidden">
            <div className="mt-0.5 mb-1.5 ms-5 flex flex-col gap-1">
              {step.detail && <Payload label="Input" text={step.detail} />}
              {step.output && <Payload label={step.status === "failed" ? "Error" : "Result"} text={step.output} />}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Payload({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <pre
        dir="auto"
        className="coach-scroll max-h-48 overflow-auto rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11.5px] leading-[1.45] break-words whitespace-pre-wrap text-foreground/85"
      >
        {text}
      </pre>
    </div>
  );
}
