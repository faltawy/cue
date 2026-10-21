import {
  AlertCircle,
  ArrowDown,
  Building2,
  Check,
  ChevronRight,
  Copy,
  FilePen,
  FilePlus,
  Folder,
  FolderPlus,
  Info,
  LayoutTemplate,
  ListChecks,
  ListPlus,
  LogIn,
  NotebookPen,
  RotateCcw,
  SquarePen,
  UserPen,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { memo, type ReactNode, useEffect, useId, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import type { CoachError } from "../../errors";
import type { EditView, Item, MeetingPhase, Step, Turn } from "../state";
import type { CoachFeedback, EvidenceTarget } from "../../move";
import { ActionsBlock, type BlockActions, ImageThumbs, Replies, SourceChips } from "./blocks";
import { MoveCard, TalkMeter } from "./coaching";
import { CoachMarkdown } from "./markdown";
import { Button, cx, IconButton } from "./primitives";
import { Steps } from "./steps";

export type TimelineActions = BlockActions & {
  retry(turn: Turn): void;
  newChat(): void;
  copy(text: string): Promise<boolean>;
  signIn(): void;
  openEvidence(target: EvidenceTarget): void;
  feedback(input: CoachFeedback): void;
};

export function Timeline({
  items,
  footer,
  empty,
  latestUndoable,
  lastAskKey,
  busy,
  actions,
  sent,
  glance = false,
  questionOpen = false,
  ready = true,
  canAddToNotes = false,
}: {
  items: readonly Item[];
  sent: number;
  glance?: boolean;
  footer?: ReactNode;
  empty: ReactNode;
  latestUndoable: string | null;
  lastAskKey: string | null;
  busy: boolean;
  questionOpen?: boolean;
  ready?: boolean;
  canAddToNotes?: boolean;
  actions: TimelineActions;
}) {
  const lastItem = items.at(-1);
  const lastTurn = [...items].reverse().find((item): item is Turn => item.kind === "turn");
  const [showEarlier, setShowEarlier] = useState(false);
  const lastTurnIndex = lastTurn ? items.indexOf(lastTurn) : -1;
  const hidden = glance && !showEarlier && lastTurnIndex > 0 ? lastTurnIndex : 0;
  const visible = hidden > 0 ? items.slice(hidden) : items;
  useEffect(() => {
    if (!glance) setShowEarlier(false);
  }, [glance]);
  return (
    <StickToBottom className="relative min-h-16 flex-1" resize="smooth" initial="instant">
      <StickToBottom.Content
        scrollClassName="coach-scroll coach-fade-y"
        className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-4 px-4 pt-4 pb-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Coach conversation"
      >
        {items.length === 0 && !footer ? empty : null}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowEarlier(true)}
            className="mx-auto rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground"
          >
            Show earlier messages
          </button>
        )}
        {visible.map((item) => (
          <ItemView
            key={item.key}
            item={item}
            latest={item.kind === "turn" && item === lastTurn}
            questionOpen={questionOpen && item.kind === "turn" && item === lastTurn}
            latestUndoable={ready ? latestUndoable : null}
            canRetry={ready && !busy && (item.kind === "turn" ? item.key === lastAskKey : lastAskKey !== null)}
            lastAsk={lastAskKey ? items.find((candidate): candidate is Turn => candidate.key === lastAskKey) : undefined}
            canReply={ready && !busy && !questionOpen && item === lastItem}
            canAddToNotes={ready && canAddToNotes}
            actions={actions}
          />
        ))}
        {footer}
      </StickToBottom.Content>
      <JumpToLatest />
      <FollowOnSend sent={sent} />
    </StickToBottom>
  );
}

function FollowOnSend({ sent }: { sent: number }) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    if (sent > 0) void scrollToBottom({ animation: "smooth", ignoreEscapes: true });
  }, [sent, scrollToBottom]);
  return null;
}

function JumpToLatest() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  return (
    <button
      type="button"
      onClick={() => void scrollToBottom()}
      aria-label="Jump to latest"
      aria-hidden={isAtBottom}
      tabIndex={isAtBottom ? -1 : 0}
      className={cx(
        "absolute bottom-3 left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-border bg-surface text-foreground shadow-md transition-[opacity,translate] duration-150",
        isAtBottom ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100",
      )}
    >
      <ArrowDown aria-hidden className="size-4" />
    </button>
  );
}

const ItemView = memo(function ItemView({
  item,
  latest,
  questionOpen,
  latestUndoable,
  canRetry,
  lastAsk,
  canReply,
  canAddToNotes,
  actions,
}: {
  item: Item;
  latest: boolean;
  questionOpen: boolean;
  latestUndoable: string | null;
  canRetry: boolean;
  lastAsk: Turn | undefined;
  canReply: boolean;
  canAddToNotes: boolean;
  actions: TimelineActions;
}) {
  switch (item.kind) {
    case "turn":
      return (
        <TurnView
          turn={item}
          latest={latest}
          questionOpen={questionOpen}
          canRetry={canRetry}
          canReply={canReply}
          canAddToNotes={canAddToNotes}
          latestUndoable={latestUndoable}
          actions={actions}
        />
      );
    case "edit":
      return <EditRow edit={item.edit} undoable={item.edit.id === latestUndoable} onUndo={actions.undo} />;
    case "error":
      return (
        <ErrorCard
          error={item.error}
          count={item.count}
          onNewChat={actions.newChat}
          onRetry={canRetry && lastAsk ? () => actions.retry(lastAsk) : undefined}
          onSignIn={actions.signIn}
        />
      );
    case "notice":
      return (
        <p className="coach-enter flex items-start justify-center gap-1.5 text-center text-[12.5px] text-muted-foreground" role="status">
          <Info aria-hidden className="mt-[3px] size-3.5 shrink-0" />
          <span dir="auto">{item.text}</span>
        </p>
      );
    case "divider":
      return (
        <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground" role="separator">
          <span className="h-px min-w-6 flex-1 bg-border" />
          <span dir="auto" className="line-clamp-2 min-w-0 text-center" title={item.text}>
            {item.text}
          </span>
          <span className="h-px min-w-6 flex-1 bg-border" />
        </div>
      );
  }
});

const EDIT_TOOLS: ReadonlySet<string> = new Set([
  "mcp__meeting__update_note",
  "mcp__meeting__add_action_item",
  "mcp__meeting__complete_action_item",
  "mcp__meeting__undo_last_coach_edit",
  "mcp__meeting__create_note",
  "mcp__meeting__update_note_details",
  "mcp__meeting__create_folder",
  "mcp__meeting__upsert_person",
  "mcp__meeting__upsert_organization",
  "mcp__meeting__add_participant",
  "mcp__meeting__upsert_template",
]);

const SHOW_TOOL = "mcp__meeting__show";

export function shownSteps(turn: Turn): Step[] {
  return turn.steps.filter((step) => {
    if (step.name === "AskUserQuestion" && step.status === "running") return false;
    if (step.name === SHOW_TOOL && step.status !== "failed") return false;
    return !(turn.edits.length > 0 && EDIT_TOOLS.has(step.name) && step.status === "ok");
  });
}

function TurnView({
  turn,
  latest,
  questionOpen,
  canRetry,
  canReply,
  canAddToNotes,
  latestUndoable,
  actions,
}: {
  turn: Turn;
  latest: boolean;
  questionOpen: boolean;
  canRetry: boolean;
  canReply: boolean;
  canAddToNotes: boolean;
  latestUndoable: string | null;
  actions: TimelineActions;
}) {
  const running = turn.status === "running" || turn.status === "sending";
  const steps = shownSteps(turn);
  const activeStep = [...steps].reverse().find((step) => step.status === "running");
  const activity =
    !running || questionOpen
      ? null
      : activeStep
        ? steps.length > 1
          ? activeStep.activeLabel
          : null
        : turn.text || turn.blocks.length > 0
          ? null
          : turn.ask !== "ask"
            ? "Catching up on the conversation"
            : "Thinking";
  const body = (
    <>
      <Steps steps={steps} />
      {activity && <Activity text={activity} />}
      {turn.edits.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {turn.edits.map((edit) => (
            <EditRow key={edit.id} edit={edit} undoable={edit.id === latestUndoable} onUndo={actions.undo} />
          ))}
        </div>
      )}
      {turn.text && <CoachMarkdown text={turn.text} streaming={running} />}
      {!running && !turn.text && turn.status === "stopped" && (
        <p className="text-[13px] text-muted-foreground">Stopped before answering.</p>
      )}
      {turn.blocks.map((block) => {
        switch (block.kind) {
          case "actions":
            return (
              <ActionsBlock
                key={block.id}
                block={block}
                canAdd={canAddToNotes}
                latestUndoable={latestUndoable}
                actions={actions}
              />
            );
          case "move":
            return (
              <MoveCard
                key={block.id}
                move={block}
                copy={actions.copy}
                onEvidence={actions.openEvidence}
                onFeedback={turn.ask === "nudge" ? actions.feedback : undefined}
              />
            );
          case "replies":
            return null;
        }
      })}
      {turn.talk && (
        <div className={cx("coach-enter", (turn.text || turn.blocks.length > 0) && "mt-3")}>
          <TalkMeter talk={turn.talk} scope="window" />
        </div>
      )}
      {turn.sources.length > 0 && <SourceChips sources={turn.sources} onOpen={actions.open} />}
      {!running &&
        turn.blocks.map((block) =>
          block.kind === "replies" && canReply ? (
            <Replies key={block.id} options={block.options} onReply={actions.reply} />
          ) : null,
        )}
    </>
  );
  const footer = !running && turn.ask !== "nudge" && (
    <TurnFooter turn={turn} latest={latest} canRetry={canRetry && turn.images.length === 0} actions={actions} />
  );

  if (turn.ask !== "ask") {
    return (
      <article className="coach-enter group/turn" aria-label={turn.ask === "nudge" ? "Nudge" : "Catch up"}>
        <div className="mb-1.5 text-[11.5px] font-medium text-muted-foreground">{turn.prompt}</div>
        <div className="border-l-2 border-warm pl-3">{body}</div>
        {footer}
      </article>
    );
  }

  return (
    <article className="group/turn flex flex-col gap-2.5" aria-label="Question and answer">
      {turn.images.length > 0 && <ImageThumbs images={turn.images} className="coach-enter ms-auto max-w-[85%] justify-end" />}
      {turn.prompt && (
        <div className="coach-enter ms-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-[14px] leading-[1.5] break-words whitespace-pre-wrap">
          <p dir="auto">{turn.prompt}</p>
        </div>
      )}
      <div className="min-w-0">
        {body}
        {footer}
      </div>
    </article>
  );
}

function Activity({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 py-0.5 text-[13px]" role="status">
      <span className="coach-sheen font-medium">{text}</span>
    </p>
  );
}

function TurnFooter({
  turn,
  latest,
  canRetry,
  actions,
}: {
  turn: Turn;
  latest: boolean;
  canRetry: boolean;
  actions: TimelineActions;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);
  if (turn.status === "failed" && !turn.text) return null;
  const meta = turn.status === "stopped" ? "Stopped" : turn.status === "failed" ? "Didn't finish" : null;
  return (
    <div
      className={cx(
        "mt-1 -mb-1 -ms-1.5 flex h-6 items-center gap-0.5 text-[11.5px] text-muted-foreground transition-opacity duration-150",
        latest ? "opacity-100" : "opacity-0 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100",
      )}
    >
      {turn.text && (
        <IconButton
          label={copied ? "Copied" : "Copy answer"}
          tooltipSide="top"
          onClick={() => void actions.copy(turn.text).then(setCopied)}
          className="size-6"
        >
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
        </IconButton>
      )}
      {canRetry && turn.ask === "ask" && (
        <IconButton label="Ask again" tooltipSide="top" onClick={() => actions.retry(turn)} className="size-6">
          <RotateCcw aria-hidden className="size-3.5" />
        </IconButton>
      )}
      {meta && <span className="ml-1 tabular-nums">{meta}</span>}
    </div>
  );
}

const EDIT_LABEL: Record<EditView["kind"], string> = {
  note: "Note added",
  add_action_item: "Action item added",
  complete_action_item: "Action item done",
  create_note: "Note created",
  update_note: "Note updated",
  create_folder: "Folder created",
  create_person: "Contact created",
  update_person: "Contact updated",
  create_organization: "Organization created",
  update_organization: "Organization updated",
  add_participant: "Participant added",
  create_template: "Template created",
  update_template: "Template updated",
};

const UNDONE_LABEL: Record<EditView["kind"], string> = {
  note: "Note removed",
  add_action_item: "Action item removed",
  complete_action_item: "Action item reopened",
  create_note: "Created note removed",
  update_note: "Note change undone",
  create_folder: "Created folder removed",
  create_person: "Created contact removed",
  update_person: "Contact change undone",
  create_organization: "Created organization removed",
  update_organization: "Organization change undone",
  add_participant: "Participant removed",
  create_template: "Created template removed",
  update_template: "Template change undone",
};

const EDIT_ICON: Record<EditView["kind"], typeof NotebookPen> = {
  note: NotebookPen,
  add_action_item: ListPlus,
  complete_action_item: ListChecks,
  create_note: FilePlus,
  update_note: FilePen,
  create_folder: FolderPlus,
  create_person: UserPlus,
  update_person: UserPen,
  create_organization: Building2,
  update_organization: Building2,
  add_participant: UsersRound,
  create_template: LayoutTemplate,
  update_template: LayoutTemplate,
};

export function EditRow({ edit, undoable, onUndo }: { edit: EditView; undoable: boolean; onUndo(id: string): void }) {
  const Icon = EDIT_ICON[edit.kind];
  if (edit.undone) {
    return (
      <p className="flex items-center gap-2 px-2.5 text-[12px] text-muted-foreground" data-testid="coach-edit" data-undone>
        <Icon aria-hidden className="size-3.5 shrink-0 opacity-70" />
        {UNDONE_LABEL[edit.kind]}
      </p>
    );
  }
  return (
    <div
      className="coach-enter flex items-start gap-2 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] leading-[1.45]"
      data-testid="coach-edit"
    >
      <Icon aria-label={EDIT_LABEL[edit.kind]} role="img" className="mt-[2px] size-3.5 shrink-0 text-muted-foreground" />
      <span dir="auto" className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]" title={edit.summary}>
        {edit.summary}
      </span>
      {undoable && (
        <Button tone="ghost" className="-my-1 h-6 px-2" onClick={() => onUndo(edit.id)}>
          Undo
        </Button>
      )}
    </div>
  );
}

export function ErrorCard({
  error,
  count = 1,
  onRetry,
  onSignIn,
  onNewChat,
}: {
  error: CoachError;
  count?: number;
  onRetry?: () => void;
  onSignIn?: () => void;
  onNewChat?: () => void;
}) {
  const auth = error.kind === "auth";
  const [signingIn, setSigningIn] = useState(false);
  const signIn = auth && !signingIn ? onSignIn : undefined;
  const newChat = error.action === "new_chat" ? onNewChat : undefined;
  const retry = (auth && !signingIn) || newChat ? undefined : onRetry;
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div
      className="coach-enter rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5"
      role="alert"
      data-testid="error-card"
    >
      <div className="flex items-start gap-2">
        <AlertCircle aria-hidden className="mt-[2px] size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">
            {error.title}
            {count > 1 && <span className="ms-1.5 font-normal text-muted-foreground tabular-nums">{count} times</span>}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {auth && signingIn ? "Finish signing in, then try again." : <InlineCode text={error.message} />}
          </p>
          {(signIn || newChat || retry || error.detail) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {signIn && (
                <Button
                  tone="primary"
                  onClick={() => {
                    setSigningIn(true);
                    signIn();
                  }}
                >
                  <LogIn aria-hidden className="size-3.5" />
                  {error.signedOut ? "Sign in" : "Sign in again"}
                </Button>
              )}
              {newChat && (
                <Button tone="primary" onClick={newChat}>
                  <SquarePen aria-hidden className="size-3.5" />
                  New chat
                </Button>
              )}
              {retry && (
                <Button tone={auth ? "primary" : "outline"} onClick={retry}>
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </Button>
              )}
              {error.detail && (
                <Button tone="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={regionId}>
                  <ChevronRight aria-hidden className={cx("size-3.5 transition-transform duration-150", open && "rotate-90")} />
                  Details
                </Button>
              )}
            </div>
          )}
          {error.detail && open && (
            <pre
              id={regionId}
              className="coach-scroll mt-2 max-h-40 overflow-auto rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] leading-[1.45] break-words whitespace-pre-wrap text-muted-foreground"
            >
              {error.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={index} className="rounded-sm bg-muted px-1 font-mono text-[0.9em] text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const EMPTY_COPY: Record<MeetingPhase, { heading: string; body: string }> = {
  none: { heading: "Waiting for your meeting", body: "Start recording in Cue (⇧⌘N) and I'll follow along." },
  live: { heading: "Listening", body: "I'll speak up if something needs you." },
  ended: { heading: "Meeting ended", body: "Ask for a summary or a follow-up." },
};

export function EmptyState({
  phase,
  onSuggestion,
  onChooseFolder,
  disabled,
  suggestions,
  compact = false,
}: {
  phase: MeetingPhase;
  compact?: boolean;
  onSuggestion(text: string): void;
  onChooseFolder?: () => void;
  disabled: boolean;
  suggestions: string[];
}) {
  const copy = EMPTY_COPY[phase];
  return (
    <div className={cx("m-auto flex w-full max-w-[340px] flex-col items-center gap-3 text-center", compact ? "py-2" : "py-8")}>
      <div>
        <h2 dir="auto" className="text-[15px] font-semibold">
          {copy.heading}
        </h2>
        <p dir="auto" className="mt-1 text-[13px] text-balance text-muted-foreground">
          {copy.body}
        </p>
      </div>
      <div className="mt-1 flex w-full flex-wrap justify-center gap-1.5" role="group" aria-label="Suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onSuggestion(suggestion)}
            className="rounded-full border border-border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {suggestion}
          </button>
        ))}
      </div>
      {onChooseFolder && (
        <div className="mt-2 flex flex-col items-center gap-2 rounded-lg border border-border px-3 py-2.5" data-testid="choose-folder">
          <p className="text-[13px] text-balance text-muted-foreground">Choose a project folder to give the coach context.</p>
          <Button tone="outline" onClick={onChooseFolder}>
            <Folder aria-hidden className="size-3.5" />
            Choose folder…
          </Button>
        </div>
      )}
    </div>
  );
}
