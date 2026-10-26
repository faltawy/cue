import {
  AlertCircle,
  ArrowUp,
  ChevronDown,
  Folder,
  ImagePlus,
  Mic,
  Square,
  X,
} from "lucide-react";
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { ProjectSource } from "../../app-bridge";
import { admitFiles, IMAGE_TYPES, MAX_IMAGES } from "../../image-limits";
import { type StatusEvent } from "../../protocol";
import { imageErrorMessage, type PreparedImage, prepareImage } from "../images";
import { DictationPhase, useDictation } from "../use-dictation";
import {
  cx,
  IconButton,
  IconButtonTone,
  TooltipAlign,
  TooltipSide,
} from "./primitives";

type Attachment = { id: number; image: PreparedImage | null };

function useAttachments() {
  const [entries, setEntries] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const count = useRef(0);
  count.current = entries.length;

  const add = useCallback((files: readonly File[]) => {
    const { accepted, error: rejected } = admitFiles(files, count.current);
    setError(rejected);
    const added = accepted.map((file) => ({ id: (nextId.current += 1), file }));
    count.current += added.length;
    setEntries((current) => [
      ...current,
      ...added.map(({ id }) => ({ id, image: null })),
    ]);
    for (const { id, file } of added) {
      prepareImage(file)
        .then((image) =>
          setEntries((current) =>
            current.map((entry) => (entry.id === id ? { id, image } : entry)),
          ),
        )
        .catch((failure: unknown) => {
          setEntries((current) => current.filter((entry) => entry.id !== id));
          setError(imageErrorMessage(failure));
        });
    }
  }, []);

  return useMemo(() => {
    const ready = entries.flatMap((entry) =>
      entry.image ? [entry.image] : [],
    );
    return {
      entries,
      error,
      ready,
      loading: entries.some((entry) => entry.image === null),
      add,
      fail: setError,
      remove: (id: number) => {
        setError(null);
        setEntries((current) => current.filter((entry) => entry.id !== id));
      },
      take: () => {
        const taken = entries.flatMap((entry) =>
          entry.image ? [{ id: entry.id, image: entry.image }] : [],
        );
        setEntries([]);
        setError(null);
        return taken;
      },
      restore: (taken: Array<{ id: number; image: PreparedImage }>) =>
        setEntries((current) => [...taken, ...current]),
    };
  }, [add, entries, error]);
}

function AttachmentStrip({
  entries,
  onRemove,
}: {
  entries: readonly Attachment[];
  onRemove(id: number): void;
}) {
  return (
    <ul
      className="flex flex-wrap gap-2 px-3 pt-2.5"
      aria-label="Attached images"
    >
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className="relative size-14 shrink-0"
          data-testid="attachment"
        >
          {entry.image ? (
            <img
              src={entry.image.thumb}
              alt={`Attached image ${index + 1}`}
              className="border-border size-14 rounded-md border object-cover"
            />
          ) : (
            <span
              role="status"
              aria-label="Preparing image"
              className="coach-skeleton block size-14 rounded-md"
            />
          )}
          <button
            type="button"
            aria-label={`Remove image ${index + 1}`}
            onClick={() => onRemove(entry.id)}
            className="border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full border transition-colors duration-100"
          >
            <X aria-hidden className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export type ComposerHandle = {
  focus(): void;
  fill(text: string): void;
  cancelDictation(): void;
};

export function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    dictationOwner?: number;
    busy: boolean;
    ready: boolean;
    placeholder: string;
    status: StatusEvent | null;
    chips: string[];
    above?: React.ReactNode;
    onSubmit(text: string, images: readonly PreparedImage[]): Promise<boolean>;
    onStop(): void;
    recall(): string | null;
    onChooseFolder(): void;
    onDefaultFolder(): void;
    onChooseProject(): void;
  }
>(function Composer(
  {
    dictationOwner = 0,
    busy,
    ready,
    placeholder,
    status,
    chips,
    above,
    onSubmit,
    onStop,
    recall,
    onChooseFolder,
    onDefaultFolder,
    onChooseProject,
  },
  ref,
) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const attachments = useAttachments();
  const canAttach = !above;
  const dictation = useDictation(dictationOwner, (recognized) => {
    setText(
      (draft) =>
        `${draft}${draft && !/\s$/.test(draft) ? " " : ""}${recognized}`,
    );
  });

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    cancelDictation: dictation.cancel,
    fill: (value) => {
      dictation.cancel();
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

  const images = canAttach ? attachments.ready : [];
  const canSend =
    ready &&
    !busy &&
    dictation.phase !== DictationPhase.Listening &&
    !attachments.loading &&
    (text.trim().length > 0 || images.length > 0);

  const send = async (value: string) => {
    const trimmed = value.trim();
    if (
      (!trimmed && images.length === 0) ||
      !ready ||
      busy ||
      attachments.loading ||
      dictation.isListening()
    )
      return;
    dictation.cancel();
    const sent = attachments.take();
    setText("");
    const ok = await onSubmit(
      trimmed,
      canAttach ? sent.map((entry) => entry.image) : [],
    );
    if (!ok) {
      setText(trimmed);
      attachments.restore(sent);
    }
  };

  const attach = (files: readonly File[]) => {
    if (files.length === 0) return;
    if (!canAttach) {
      attachments.fail("Answer the question first, then attach images.");
      return;
    }
    attachments.add(files);
  };

  const filesOf = (transfer: DataTransfer | null) => [
    ...(transfer?.files ?? []),
  ];
  const carriesFiles = (transfer: DataTransfer | null) =>
    [...(transfer?.types ?? [])].includes("Files");

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
        requestAnimationFrame(() =>
          input.current?.setSelectionRange(last.length, last.length),
        );
      }
    }
  };

  const showChips =
    chips.length > 0 &&
    text === "" &&
    attachments.entries.length === 0 &&
    !busy &&
    ready &&
    !above;

  return (
    <div
      ref={dictation.lifecycle}
      className="border-border bg-surface flex min-h-0 flex-col border-t px-3 pt-2.5 pb-3"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-col">
        {above}
        {showChips && (
          <div
            className="coach-fade-x -mx-3 mb-2 flex shrink-0 [scrollbar-width:none] gap-1.5 overflow-x-auto px-3"
            role="group"
            aria-label="Suggestions"
          >
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void send(chip)}
                dir="auto"
                className="border-border text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors duration-100"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        {dictation.error && (
          <p role="alert" className="text-destructive mb-1.5 text-[12px]">
            {dictation.error}
          </p>
        )}
        {dictation.phase !== DictationPhase.Idle && (
          <p role="status" className="text-muted-foreground mb-1.5 text-[12px]">
            {dictation.phase === DictationPhase.Listening
              ? "Listening… Click stop to transcribe."
              : "Transcribing…"}{" "}
            Press Escape to cancel.
          </p>
        )}
        {attachments.error && (
          <p
            role="alert"
            dir="auto"
            className="coach-enter text-destructive mb-1.5 flex items-start gap-1.5 text-[12px]"
          >
            <AlertCircle aria-hidden className="mt-[2px] size-3.5 shrink-0" />
            <span className="min-w-0">{attachments.error}</span>
          </p>
        )}
        <div
          className={cx(
            "shrink-0 rounded-lg border bg-surface transition-[border-color] duration-150",
            focused || dragging ? "border-foreground/25" : "border-border",
          )}
          data-dragging={dragging || undefined}
          onDragOver={(event) => {
            if (!carriesFiles(event.dataTransfer)) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(
                event.relatedTarget instanceof Node
                  ? event.relatedTarget
                  : null,
              )
            ) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            if (!carriesFiles(event.dataTransfer)) return;
            event.preventDefault();
            setDragging(false);
            attach(filesOf(event.dataTransfer));
          }}
        >
          {attachments.entries.length > 0 && (
            <AttachmentStrip
              entries={attachments.entries}
              onRemove={attachments.remove}
            />
          )}
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
            onPaste={(event) => {
              const files = filesOf(event.clipboardData);
              if (files.length === 0) return;
              event.preventDefault();
              attach(files);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-keyshortcuts="Enter"
            className="coach-scroll placeholder:text-muted-foreground block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-[1.5] outline-none focus-visible:outline-none"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <ProjectMenu
              status={status}
              onChooseFolder={onChooseFolder}
              onDefaultFolder={onDefaultFolder}
              onChooseProject={onChooseProject}
            />
            <span className="flex-1" />
            {canAttach && (
              <>
                <input
                  ref={picker}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  multiple
                  hidden
                  data-testid="image-picker"
                  onChange={(event) => {
                    attach([...(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
                <IconButton
                  label="Attach images"
                  tooltipSide={TooltipSide.Top}
                  disabled={attachments.entries.length >= MAX_IMAGES}
                  onClick={() => picker.current?.click()}
                >
                  <ImagePlus aria-hidden className="size-4" />
                </IconButton>
              </>
            )}
            <IconButton
              label={
                dictation.phase === DictationPhase.Listening
                  ? "Stop dictation"
                  : "Start dictation"
              }
              title="Click to start or stop dictation. Mute your call first for a private question."
              tooltipSide={TooltipSide.Top}
              disabled={
                dictation.phase !== DictationPhase.Listening &&
                (!status?.appConnected ||
                  !!above ||
                  dictation.phase === DictationPhase.Transcribing)
              }
              aria-keyshortcuts="Space Enter"
              aria-pressed={dictation.phase === DictationPhase.Listening}
              className="size-7 touch-none"
              tone={
                dictation.phase === DictationPhase.Listening
                  ? IconButtonTone.Primary
                  : IconButtonTone.Ghost
              }
              onKeyDown={(event) => {
                if (event.key !== " " && event.key !== "Enter") return;
                event.stopPropagation();
                if (event.repeat) event.preventDefault();
              }}
              onClick={dictation.toggle}
            >
              {dictation.phase === DictationPhase.Listening ? (
                <Square aria-hidden className="size-3 fill-current" />
              ) : (
                <Mic aria-hidden className="size-4" />
              )}
            </IconButton>
            {busy ? (
              <IconButton
                label="Stop"
                shortcut={["esc"]}
                tooltipSide={TooltipSide.Top}
                tooltipAlign={TooltipAlign.End}
                onClick={onStop}
                tone={IconButtonTone.Primary}
              >
                <Square aria-hidden className="size-3 fill-current" />
              </IconButton>
            ) : (
              <IconButton
                label={ready ? "Send" : "Waiting for the coach"}
                shortcut={["enter"]}
                tooltipSide={TooltipSide.Top}
                tooltipAlign={TooltipAlign.End}
                disabled={!canSend}
                onClick={() => void send(text)}
                tone={canSend ? IconButtonTone.Primary : IconButtonTone.Quiet}
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
  onChooseProject,
}: {
  status: StatusEvent | null;
  onChooseFolder(): void;
  onDefaultFolder(): void;
  onChooseProject(): void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (
        !root.current?.contains(
          event.target instanceof Node ? event.target : null,
        )
      )
        setOpen(false);
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
      const items = [
        ...(root.current?.querySelectorAll<HTMLButtonElement>(
          "[role=menuitem]:not(:disabled)",
        ) ?? []),
      ];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.findIndex(
        (element) => element === document.activeElement,
      );
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey, { capture: true });
    root.current
      ?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")
      ?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  if (!status) return <span className="coach-skeleton ml-1 h-4 w-20" />;
  const { project } = status;
  const series = project.source === ProjectSource.Series;
  const triggerClass =
    "flex max-w-[180px] min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground";

  if (project.needsFolder) {
    return (
      <button
        type="button"
        onClick={onChooseProject}
        title="Choose a project folder for the coach"
        className={triggerClass}
      >
        <Folder aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">No folder</span>
      </button>
    );
  }

  const item = (label: string, detail: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
      className="hover:bg-muted focus-visible:bg-muted flex w-full min-w-0 flex-col rounded-md px-2 py-1.5 text-start focus-visible:outline-none"
    >
      <span className="text-[13px]">{label}</span>
      <bdi dir="auto" className="text-muted-foreground truncate text-[12px]">
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
        className={triggerClass}
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
          className="coach-enter border-border bg-surface absolute bottom-[calc(100%+6px)] left-0 z-20 w-[min(360px,calc(100vw-24px))] rounded-lg border p-1 shadow-lg"
        >
          <div className="px-2 pt-1.5 pb-1">
            <p className="flex min-w-0 items-baseline gap-1 text-[13px]">
              <span className="text-muted-foreground shrink-0">
                Coach reads from
              </span>
              <bdi
                dir="auto"
                className="min-w-0 truncate font-semibold"
                data-testid="project-folder"
              >
                {folderName(project.path)}
              </bdi>
            </p>
            <p
              className="text-muted-foreground mt-0.5 truncate text-left font-mono text-[11px] [direction:rtl]"
              title={project.path}
            >
              <bdi dir="ltr">{project.path}</bdi>
            </p>
            {status.appConnected && project.series && (
              <p
                className="text-muted-foreground mt-1 text-[12px]"
                data-testid="project-source"
              >
                {series ? "Set for this series" : "Default folder"}
              </p>
            )}
          </div>
          <div className="bg-border my-1 h-px" />
          {!status.appConnected ? (
            <p className="text-muted-foreground px-2 py-1.5 text-[12.5px]">
              Open the coach from Cue to change it.
            </p>
          ) : !project.series ? (
            <p className="text-muted-foreground px-2 py-1.5 text-[12.5px]">
              {status.meeting
                ? "This meeting isn't part of a series."
                : "You can change it once a meeting starts."}
            </p>
          ) : (
            <>
              {item(
                "Choose folder for this series…",
                project.series,
                onChooseFolder,
              )}
              {series &&
                item(
                  "Use default folder",
                  folderName(project.defaultProject),
                  onDefaultFolder,
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
