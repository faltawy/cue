import { Check, Copy, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";

import {
  type CoachFeedback,
  evidenceMomentId,
  type EvidenceTarget,
  FeedbackReason,
  type Moment,
  type Move,
  type MoveTag,
  type MoveVerb,
} from "../../move";
import {
  percentLabel,
  talkShares,
  type TalkStats,
  windowMinutes,
} from "../../talk-time";
import { formatTimestamp } from "../../timestamp";
import { type ActionResult } from "../use-coach";
import {
  cx,
  IconButton,
  TooltipAlign,
  TooltipSide,
  useFlag,
} from "./primitives";

export enum TalkScope {
  Window = "window",
  Meeting = "meeting",
}

export enum FeedbackPhase {
  Idle = "idle",
  Pending = "pending",
  Saved = "saved",
}

export type CopyText = (text: string) => Promise<boolean>;

const TAG_LABEL: Record<MoveTag, string> = {
  open_question: "Open question",
  pushback: "Pushback",
  buying_signal: "Buying signal",
  risk: "Risk",
  vague_promise: "Vague promise",
  over_promise: "Over-promise",
  giving_ground: "Giving ground",
  talk_time: "Talk time",
  decision_owner: "Decision owner",
  agenda: "Agenda",
};

export function MoveCard({
  move,
  copy,
  onEvidence,
  onFeedback,
  compact = false,
}: {
  compact?: boolean;
  move: Move;
  copy: CopyText;
  onEvidence?: (target: EvidenceTarget) => void;
  onFeedback?: (feedback: CoachFeedback) => Promise<ActionResult>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      className="coach-enter flex flex-col gap-2 [&:not(:first-child)]:mt-3"
      aria-label="Coaching move"
      data-testid="move"
    >
      {compact && <LineQuote verb={move.verb} line={move.line} copy={copy} />}
      {compact && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="text-muted-foreground hover:text-foreground self-start text-[12px]"
        >
          Suggestion details
        </button>
      )}
      <div
        hidden={compact && !expanded}
        className={compact && !expanded ? "hidden" : "flex flex-col gap-2"}
      >
        <div className="flex flex-col items-start gap-1">
          {!compact && (
            <span className="border-border text-muted-foreground inline-flex h-5 shrink-0 items-center rounded-[4px] border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap">
              {TAG_LABEL[move.tag]}
            </span>
          )}
          <h3
            dir="auto"
            className="w-full text-[14px] leading-[1.4] font-semibold [overflow-wrap:anywhere]"
          >
            {move.headline}
          </h3>
        </div>
        {!compact && (
          <LineQuote verb={move.verb} line={move.line} copy={copy} />
        )}
        {move.watch_out && (
          <p
            className="text-muted-foreground flex items-start gap-1.5 text-[12.5px] leading-[1.45]"
            data-testid="move-watch-out"
          >
            <TriangleAlert aria-hidden className="mt-[2px] size-3.5 shrink-0" />
            <span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">
              {move.watch_out}
            </span>
          </p>
        )}
        {move.moment && (
          <MomentQuote
            moment={move.moment}
            onOpen={
              move.evidence && onEvidence
                ? () => onEvidence(move.evidence!)
                : undefined
            }
          />
        )}
        {onFeedback && <FeedbackControl move={move} onFeedback={onFeedback} />}
      </div>
    </section>
  );
}

export function LineQuote({
  verb,
  line,
  copy,
}: {
  verb: MoveVerb;
  line: string;
  copy: CopyText;
}) {
  const [copied, flagCopied] = useFlag();
  return (
    <div
      className="border-border bg-background flex items-start gap-1 rounded-md border py-2 ps-3 pe-1.5"
      data-testid="move-line"
    >
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-[11.5px] leading-[1.4] font-medium">
          {verb}
        </span>
        <p
          dir="auto"
          className="text-[15px] leading-[1.45] font-medium [overflow-wrap:anywhere]"
        >
          {line}
        </p>
      </div>
      <IconButton
        label={copied ? "Copied" : "Copy the line"}
        tooltipSide={TooltipSide.Top}
        tooltipAlign={TooltipAlign.End}
        onClick={() => void copy(line).then((ok) => ok && flagCopied())}
        className="-mt-0.5 size-7"
      >
        {copied ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
      </IconButton>
    </div>
  );
}

export function MomentQuote({
  moment,
  onOpen,
}: {
  moment: Pick<Moment, "speaker" | "quote"> & { at?: string | null };
  onOpen?: () => void;
}) {
  return (
    <figure
      dir="auto"
      className="border-border text-muted-foreground m-0 border-s-2 ps-2.5 text-[12px] leading-[1.45]"
      data-testid="move-moment"
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open transcript at ${moment.at ?? "this moment"}`}
          className="hover:text-foreground block w-full text-start"
        >
          <blockquote
            title={moment.quote}
            className="line-clamp-2 [overflow-wrap:anywhere]"
          >
            {moment.quote}
          </blockquote>
        </button>
      ) : (
        <blockquote
          title={moment.quote}
          className="line-clamp-2 [overflow-wrap:anywhere]"
        >
          {moment.quote}
        </blockquote>
      )}
      <figcaption className="mt-0.5 flex min-w-0 items-baseline gap-1">
        <bdi title={moment.speaker} className="min-w-0 truncate font-medium">
          {moment.speaker}
        </bdi>
        {moment.at && (
          <>
            <span aria-hidden>·</span>
            <time className="shrink-0 tabular-nums">{moment.at}</time>
          </>
        )}
      </figcaption>
    </figure>
  );
}

const FEEDBACK_REASONS = [
  [FeedbackReason.AlreadyHandled, "Already handled"],
  [FeedbackReason.PoorTiming, "Poor timing"],
  [FeedbackReason.Irrelevant, "Not relevant"],
  [FeedbackReason.WrongLanguage, "Wrong language"],
] as const;

function FeedbackControl({
  move,
  onFeedback,
}: {
  move: Move;
  onFeedback(feedback: CoachFeedback): Promise<ActionResult>;
}) {
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [state, setState] = useState<{
    phase: FeedbackPhase;
    error: string | null;
  }>({ phase: FeedbackPhase.Idle, error: null });
  const submitted = useRef(false);
  const momentId = move.evidence ? evidenceMomentId(move.evidence) : undefined;
  const send = async (input: Omit<CoachFeedback, "category" | "momentId">) => {
    if (submitted.current) return;
    submitted.current = true;
    setState({ phase: FeedbackPhase.Pending, error: null });
    try {
      const result = await onFeedback({
        category: move.tag,
        ...(momentId ? { momentId } : {}),
        ...input,
      });
      submitted.current = result.ok;
      setState(
        result.ok
          ? { phase: FeedbackPhase.Saved, error: null }
          : { phase: FeedbackPhase.Idle, error: result.message },
      );
    } catch {
      submitted.current = false;
      setState({
        phase: FeedbackPhase.Idle,
        error: "Could not save feedback. Try again.",
      });
    }
  };
  const pending = state.phase === FeedbackPhase.Pending;
  if (state.phase === FeedbackPhase.Saved)
    return (
      <p role="status" className="text-muted-foreground text-[11.5px]">
        Feedback saved
      </p>
    );
  return (
    <div
      className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11.5px]"
      data-testid="nudge-feedback"
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => void send({ useful: true })}
        className="hover:text-foreground disabled:opacity-50"
      >
        Useful
      </button>
      <button
        type="button"
        disabled={pending}
        aria-expanded={reasonsOpen}
        onClick={() => setReasonsOpen((open) => !open)}
        className="hover:text-foreground disabled:opacity-50"
      >
        Not useful
      </button>
      {reasonsOpen && (
        <div
          role="group"
          aria-label="Why was this nudge not useful?"
          className="flex flex-wrap gap-2"
        >
          {FEEDBACK_REASONS.map(([reason, label]) => (
            <button
              key={reason}
              type="button"
              disabled={pending}
              onClick={() => void send({ useful: false, reason })}
              className="hover:text-foreground disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => void send({ useful: false })}
            className="hover:text-foreground disabled:opacity-50"
          >
            No reason
          </button>
        </div>
      )}
      {pending && <span role="status">Saving…</span>}
      {state.error && (
        <span role="alert" className="text-destructive">
          {state.error}
        </span>
      )}
    </div>
  );
}

const OTHER_FILLS = [
  "bg-foreground/35",
  "bg-foreground/22",
  "bg-foreground/14",
];

type Share = {
  key: string;
  name: string;
  ms: number;
  you: boolean;
  fill: string;
};

function shares(talk: TalkStats): Share[] {
  const { youMs, shown, rest } = talkShares(talk);
  return [
    { key: "you", name: "You", ms: youMs, you: true, fill: "bg-warm" },
    ...shown.map((entry, index) => ({
      key: `speaker-${index}`,
      name: entry.speaker,
      ms: entry.ms,
      you: false,
      fill: OTHER_FILLS[index] ?? "bg-foreground/14",
    })),
    ...(rest
      ? [
          {
            key: "rest",
            name: `${rest.speakers} others`,
            ms: rest.ms,
            you: false,
            fill: OTHER_FILLS.at(-1) ?? "bg-foreground/14",
          },
        ]
      : []),
  ];
}

function questionsText(count: number): string {
  if (count === 0) return "You asked no questions";
  return `You asked ${count} ${count === 1 ? "question" : "questions"}`;
}

export function TalkMeter({
  talk,
  scope,
}: {
  talk: TalkStats;
  scope: TalkScope;
}) {
  const scopeLabel =
    scope === TalkScope.Meeting
      ? "whole meeting"
      : `last ${windowMinutes(talk)} min`;
  const entries = shares(talk);
  return (
    <section
      role="group"
      aria-label={`Talk time, ${scopeLabel}`}
      className="flex flex-col gap-1.5"
      data-testid="talk-meter"
    >
      <h3 className="text-muted-foreground text-[12px] font-medium">
        Talk time <span className="font-normal">· {scopeLabel}</span>
      </h3>
      <div
        aria-hidden
        className="flex h-2 gap-0.5 overflow-hidden rounded-full"
      >
        {entries
          .filter((entry) => entry.ms > 0)
          .map((entry) => (
            <span
              key={entry.key}
              data-testid="talk-segment"
              className={cx("h-full min-w-[3px] basis-0", entry.fill)}
              style={{ flexGrow: entry.ms }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] leading-[1.45]">
        {entries.map((entry) => (
          <li
            key={entry.key}
            data-testid="talk-share"
            data-you={entry.you ? "true" : undefined}
            className={cx(
              "flex min-w-0 max-w-full items-center gap-1",
              entry.you ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cx("size-2 shrink-0 rounded-full", entry.fill)}
            />
            <bdi
              title={entry.name}
              className={cx(
                "min-w-0 max-w-[14em] truncate",
                entry.you && "font-medium",
              )}
            >
              {entry.name}
            </bdi>
            <span className="shrink-0 tabular-nums">
              {percentLabel(entry.ms, talk.totalMs)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground flex flex-wrap gap-x-1 text-[12px] leading-[1.45] tabular-nums">
        <span>Longest stretch {formatTimestamp(talk.youLongestMs)}</span>
        <span aria-hidden>·</span>
        <span>{questionsText(talk.youQuestions)}</span>
      </p>
    </section>
  );
}
