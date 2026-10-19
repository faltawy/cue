import { ArrowUp, ChevronDown, Folder, Square } from "lucide-react";
import { forwardRef, type KeyboardEvent, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import type { StatusEvent } from "../../protocol";
import { cx, IconButton, Kbd } from "./primitives";

export type ComposerHandle = { focus(): void; fill(text: string): void };

export function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    busy: boolean;
    ready: boolean;
    placeholder: string;
    status: StatusEvent | null;
    chips: string[];
    above?: React.ReactNode;
    onSubmit(text: string): Promise<boolean>;
    onStop(): void;
    recall(): string | null;
    onChooseFolder(): void;
    onDefaultFolder(): void;
  }
>(function Composer(
  { busy, ready, placeholder, status, chips, above, onSubmit, onStop, recall, onChooseFolder, onDefaultFolder },
  ref,
) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    fill: (value) => {
      setText(value);
      requestAnimationFrame(() => {
        const element = input.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(value.length, value.length);
      });
    },
  }));

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text]);

  const canSend = ready && !busy && text.trim().length > 0;

  const send = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !ready || busy) return;
    setText("");
    const ok = await onSubmit(trimmed);
    if (!ok) setText(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(text);
      return;
    }
    if (event.key === "ArrowUp" && text === "" && !event.shiftKey) {
      const last = recall();
      if (last) {
        event.preventDefault();
        setText(last);
        requestAnimationFrame(() => input.current?.setSelectionRange(last.length, last.length));
      }
    }
  };

  const showChips = chips.length > 0 && text === "" && !busy && ready && !above;

  return (
    <div className="flex min-h-0 flex-col border-t border-border bg-surface px-3 pt-2.5 pb-3">
      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-col">
        {above}
        {showChips && (
          <div
            className="coach-fade-x -mx-3 mb-2 flex shrink-0 gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]"
            role="group"
            aria-label="Suggestions"
          >
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void send(chip)}
                dir="auto"
                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[12px] whitespace-nowrap text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <div
          className={cx(
            "shrink-0 rounded-lg border bg-surface transition-[border-color] duration-150",
            focused ? "border-foreground/25" : "border-border",
          )}
        >
          <label className="sr-only" htmlFor="coach-input">
            Ask the coach
          </label>
          <textarea
            id="coach-input"
            ref={input}
            rows={1}
            value={text}
            dir="auto"
            placeholder={placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-keyshortcuts="Enter"
            className="coach-scroll block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-[1.5] outline-none placeholder:text-muted-foreground focus-visible:outline-none"          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <ProjectMenu status={status} onChooseFolder={onChooseFolder} onDefaultFolder={onDefaultFolder} />
            <span className="flex-1" />
            {focused && !busy && (
              <span className="mr-1 hidden items-center gap-1 text-[11px] text-muted-foreground min-[400px]:flex">
                <Kbd keys={["enter"]} /> send
              </span>
            )}
            {busy ? (
              <IconButton
                label="Stop"
                shortcut={["esc"]}
                tooltipSide="top"
                tooltipAlign="end"
                onClick={onStop}
                tone="primary"
              >
                <Square aria-hidden className="size-3 fill-current" />
              </IconButton>
            ) : (
              <IconButton
                label={ready ? "Send" : "Waiting for the coach"}
                shortcut={["enter"]}
                tooltipSide="top"
                tooltipAlign="end"
                disabled={!canSend}
                onClick={() => void send(text)}
                tone={canSend ? "primary" : "quiet"}
              >
                <ArrowUp aria-hidden className="size-4" />
              </IconButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function ProjectMenu({
  status,
  onChooseFolder,
  onDefaultFolder,
}: {
  status: StatusEvent | null;
  onChooseFolder(): void;
  onDefaultFolder(): void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target instanceof Node ? event.target : null)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.findIndex((element) => element === document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey, { capture: true });
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  if (!status) return <span className="coach-skeleton ml-1 h-4 w-20" />;
  const { project } = status;
  const series = project.source === "series";

  const item = (label: string, detail: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
      className="flex w-full min-w-0 flex-col rounded-md px-2 py-1.5 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="text-[13px]">{label}</span>
      <bdi dir="auto" className="truncate text-[12px] text-muted-foreground">
        {detail}
      </bdi>
    </button>
  );

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={project.path}
        className={cx(
          "flex max-w-[180px] min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground",
        )}
      >
        <Folder aria-hidden className="size-3.5 shrink-0" />
        <span dir="auto" className="truncate">
          {folderName(project.path)}
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0 opacity-70" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Project folder"
          className="coach-enter absolute bottom-[calc(100%+6px)] left-0 z-20 w-[min(360px,calc(100vw-24px))] rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          <div className="px-2 pt-1.5 pb-1">
            <p className="flex min-w-0 items-baseline gap-1 text-[13px]">
              <span className="shrink-0 text-muted-foreground">Coach reads from</span>
              <bdi dir="auto" className="min-w-0 truncate font-semibold" data-testid="project-folder">
                {folderName(project.path)}
              </bdi>
            </p>
            <p
              className="mt-0.5 truncate text-left font-mono text-[11px] text-muted-foreground [direction:rtl]"
              title={project.path}
            >
              <bdi dir="ltr">{project.path}</bdi>
            </p>
            {status.appConnected && project.series && (
              <p className="mt-1 text-[12px] text-muted-foreground" data-testid="project-source">
                {series ? "Set for this series" : "Default folder"}
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          {!status.appConnected ? (
            <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">Open the coach from Cue to change it.</p>
          ) : !project.series ? (
            <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">
              {status.meeting ? "This meeting isn't part of a series." : "You can change it once a meeting starts."}
            </p>
          ) : (
            <>
              {item("Choose folder for this series…", project.series, onChooseFolder)}
              {series && item("Use default folder", folderName(project.defaultProject), onDefaultFolder)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
