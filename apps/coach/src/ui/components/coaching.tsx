import { Check, Copy, TriangleAlert } from "lucide-react";

import type { Moment, Move, MoveTag, MoveVerb } from "../../move";
import { percentLabel, type TalkStats, talkShares, windowMinutes } from "../../talk-time";
import { formatTimestamp } from "../../timestamp";
import { cx, IconButton, useFlag } from "./primitives";

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

export function MoveCard({ move, copy }: { move: Move; copy: CopyText }) {
  return (
    <section className="coach-enter flex flex-col gap-2 [&:not(:first-child)]:mt-3" aria-label="Coaching move" data-testid="move">
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex h-5 shrink-0 items-center rounded-[4px] border border-border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap text-muted-foreground">
          {TAG_LABEL[move.tag]}
        </span>
        <h3 dir="auto" className="w-full text-[14px] leading-[1.4] font-semibold [overflow-wrap:anywhere]">
          {move.headline}
        </h3>
      </div>
      <LineQuote verb={move.verb} line={move.line} copy={copy} />
      {move.watch_out && (
        <p className="flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-muted-foreground" data-testid="move-watch-out">
          <TriangleAlert aria-hidden className="mt-[2px] size-3.5 shrink-0" />
          <span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">
            {move.watch_out}
          </span>
        </p>
      )}
      {move.moment && <MomentQuote moment={move.moment} />}
    </section>
  );
}

export function LineQuote({ verb, line, copy }: { verb: MoveVerb; line: string; copy: CopyText }) {
  const [copied, flagCopied] = useFlag();
  return (
    <div className="flex items-start gap-1 rounded-md border border-border bg-background py-2 ps-3 pe-1.5" data-testid="move-line">
      <div className="min-w-0 flex-1">
        <span className="block text-[11.5px] leading-[1.4] font-medium text-muted-foreground">{verb}</span>
        <p dir="auto" className="text-[15px] leading-[1.45] font-medium [overflow-wrap:anywhere]">
          {line}
        </p>
      </div>
      <IconButton
        label={copied ? "Copied" : "Copy the line"}
        tooltipSide="top"
        tooltipAlign="end"
        onClick={() => void copy(line).then((ok) => ok && flagCopied())}
        className="-mt-0.5 size-7"
      >
        {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      </IconButton>
    </div>
  );
}

export function MomentQuote({ moment }: { moment: Pick<Moment, "speaker" | "quote"> & { at?: string | null } }) {
  return (
    <figure className="m-0 border-s-2 border-border ps-2.5 text-[12px] leading-[1.45] text-muted-foreground" data-testid="move-moment">
      <blockquote dir="auto" title={moment.quote} className="line-clamp-2 [overflow-wrap:anywhere]">
        {moment.quote}
      </blockquote>
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

const OTHER_FILLS = ["bg-foreground/35", "bg-foreground/22", "bg-foreground/14"];

type Share = { key: string; name: string; ms: number; you: boolean; fill: string };

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
      ? [{ key: "rest", name: `${rest.speakers} others`, ms: rest.ms, you: false, fill: OTHER_FILLS.at(-1) ?? "bg-foreground/14" }]
      : []),
  ];
}

function questionsText(count: number): string {
  if (count === 0) return "You asked no questions";
  return `You asked ${count} ${count === 1 ? "question" : "questions"}`;
}

export function TalkMeter({ talk, scope }: { talk: TalkStats; scope: "window" | "meeting" }) {
  const scopeLabel = scope === "meeting" ? "whole meeting" : `last ${windowMinutes(talk)} min`;
  const entries = shares(talk);
  return (
    <section role="group" aria-label={`Talk time, ${scopeLabel}`} className="flex flex-col gap-1.5" data-testid="talk-meter">
      <h3 className="text-[12px] font-medium text-muted-foreground">
        Talk time <span className="font-normal">· {scopeLabel}</span>
      </h3>
      <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
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
            className={cx("flex min-w-0 max-w-full items-center gap-1", entry.you ? "text-foreground" : "text-muted-foreground")}
          >
            <span aria-hidden className={cx("size-2 shrink-0 rounded-full", entry.fill)} />
            <bdi title={entry.name} className={cx("min-w-0 max-w-[14em] truncate", entry.you && "font-medium")}>
              {entry.name}
            </bdi>
            <span className="shrink-0 tabular-nums">{percentLabel(entry.ms, talk.totalMs)}</span>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-1 text-[12px] leading-[1.45] text-muted-foreground tabular-nums">
        <span>Longest stretch {formatTimestamp(talk.youLongestMs)}</span>
        <span aria-hidden>·</span>
        <span>{questionsText(talk.youQuestions)}</span>
      </p>
    </section>
  );
}
