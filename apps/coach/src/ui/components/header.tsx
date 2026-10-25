import { ChevronDown, SquarePen } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { StripState } from "../../meeting-state";
import { approxUsd, formatUsd } from "../../pricing";
import { ProactiveState, type ProactiveView } from "../../proactive";
import { type TranscriptLineView } from "../../protocol";
import { type CoachProvider, providerName } from "../../provider";
import { formatTokens, type TurnUsage } from "../../usage";
import { Connection, TranscriptView } from "../state";
import {
  ariaShortcut,
  Button,
  cx,
  Kbd,
  Tone,
  Tooltip,
  TooltipAlign,
} from "./primitives";

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "narrow",
});

export function formatEndedAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "Ended just now";
  if (minutes < 60) return `Ended ${RELATIVE.format(-minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Ended ${RELATIVE.format(-hours, "hour")}`;
  return `Ended ${RELATIVE.format(-Math.floor(hours / 24), "day")}`;
}

export const CATCH_UP_SHORTCUT = ["mod", "j"];

export const LONG_CHAT_FROM = 0.8;

export function isLongChat(usage: TurnUsage | null): boolean {
  if (!usage?.contextTokens || !usage.contextWindow) return false;
  return usage.contextTokens / usage.contextWindow >= LONG_CHAT_FROM;
}

export function spendTooltip(view: ProactiveView): string {
  const tokens = `${formatTokens(view.meetingTokens)} tokens this meeting, ${formatTokens(view.cachedTokens)} of them re-read from cache.`;
  const limit = formatUsd(view.capUsd);
  if (view.state === ProactiveState.Unpriced)
    return `Nudges paused because model pricing is unavailable. Asking still works. ${tokens}`;
  if (view.state === ProactiveState.Capped)
    return `Nudges reached the ${limit} limit for this meeting. Asking still works. ${tokens}`;
  if (view.state === ProactiveState.Quiet)
    return `Quiet for this meeting. Asking still works. ${tokens}`;
  if (view.state === ProactiveState.Off) return `Nudges are off. ${tokens}`;
  return `Nudges ${approxUsd(view.nudgesUsd)} of the ${limit} limit. ${tokens}`;
}

function ProactiveBudget({ view }: { view: ProactiveView }) {
  const capped =
    view.state === ProactiveState.Capped ||
    view.state === ProactiveState.Unpriced;
  if (!capped && view.meetingUsd !== null && view.meetingUsd <= 0) return null;
  return (
    <Tooltip label={spendTooltip(view)} align={TooltipAlign.End}>
      <span
        data-testid="proactive-budget"
        className="text-muted-foreground shrink-0 text-[11.5px] tabular-nums max-[399px]:hidden"
      >
        {capped
          ? "Nudges paused"
          : view.meetingUsd === null
            ? "Cost unavailable"
            : `${approxUsd(view.meetingUsd)} this meeting`}
      </span>
    </Tooltip>
  );
}

export function Header({
  provider,
  connection,
  transcript,
  usage,
  proactive,
  onNewChat,
  newChatDisabled,
  onPalette,
}: {
  provider?: CoachProvider;
  connection: Connection;
  transcript: TranscriptView | null;
  usage: TurnUsage | null;
  proactive: ProactiveView | null;
  onNewChat(): void;
  newChatDisabled: boolean;
  onPalette(): void;
}) {
  const strip = transcript?.strip;
  const settled = connection === Connection.Open;
  const live = settled && strip?.state === StripState.Live;
  const endedTitle =
    strip?.state === StripState.Waiting ? strip.lastTitle : null;
  const now = useNow(
    live ? 1_000 : 60_000,
    live || (settled && endedTitle !== null),
  );
  const title =
    strip?.state === StripState.Live ? strip.title : (endedTitle ?? "Coach");
  const longChat = isLongChat(usage);
  let subtitle: ReactNode = null;
  if (!settled) {
    subtitle = connection === Connection.Lost ? "Reconnecting…" : "Connecting…";
  } else if (strip?.state === StripState.Live && live) {
    subtitle =
      strip.startedAt === null ? (
        "Recording"
      ) : (
        <>
          <span className="max-[399px]:sr-only">Recording · </span>
          {formatElapsed(now - strip.startedAt)}
        </>
      );
  } else if (strip?.state === StripState.Waiting && endedTitle !== null) {
    subtitle =
      strip.endedAt === null ? "Ended" : formatEndedAgo(now - strip.endedAt);
  }
  return (
    <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <span
        aria-hidden
        className={cx(
          "size-2 shrink-0 rounded-full",
          !settled
            ? "coach-pulse bg-muted-foreground"
            : live
              ? "coach-live-dot bg-live"
              : "bg-muted-foreground/40",
        )}
      />
      <div
        className="flex min-w-0 flex-1 items-baseline gap-1.5"
        role="status"
        aria-live="polite"
      >
        <bdi
          dir="auto"
          className="min-w-0 truncate text-[13.5px] font-semibold"
          title={title}
        >
          {title}
        </bdi>
        {subtitle && (
          <span
            className="text-muted-foreground shrink-0 text-[12px] tabular-nums"
            data-testid="header-subtitle"
          >
            {subtitle}
          </span>
        )}
      </div>
      {provider && (
        <span className="text-muted-foreground shrink-0 text-[11.5px]">
          {providerName(provider)}
        </span>
      )}
      {live && proactive && <ProactiveBudget view={proactive} />}
      <Tooltip
        label={
          longChat ? "Long chat. The coach may forget the start" : "New chat"
        }
        shortcut={["mod", "shift", "o"]}
        align={TooltipAlign.End}
      >
        <Button
          tone={Tone.Ghost}
          onClick={onNewChat}
          disabled={newChatDisabled}
          aria-label={
            longChat ? "New chat (this chat is getting long)" : "New chat"
          }
          aria-keyshortcuts={ariaShortcut(["mod", "shift", "o"])}
          className="relative max-[399px]:px-1.5"
        >
          <SquarePen aria-hidden className="size-4 min-[400px]:hidden" />
          <span className="max-[399px]:sr-only">New chat</span>
          {longChat && (
            <span
              aria-hidden
              data-testid="long-chat-dot"
              className="bg-foreground/70 absolute top-1 right-0.5 size-1.5 rounded-full rtl:right-auto rtl:left-0.5"
            />
          )}
        </Button>
      </Tooltip>
      <Tooltip label="Actions" shortcut={["mod", "k"]} align={TooltipAlign.End}>
        <button
          type="button"
          onClick={onPalette}
          aria-label="Actions"
          aria-keyshortcuts={ariaShortcut(["mod", "k"])}
          className="hover:bg-muted -me-1 grid h-7 place-items-center rounded-md px-1.5 transition-colors duration-100"
        >
          <Kbd keys={["mod", "k"]} />
        </button>
      </Tooltip>
    </header>
  );
}

export type SpeakerTurn = { speaker: string; you: boolean; texts: string[] };

export function speakerTurns(
  lines: readonly TranscriptLineView[],
): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last.speaker === line.speaker) last.texts.push(line.text);
    else
      turns.push({ speaker: line.speaker, you: line.you, texts: [line.text] });
  }
  return turns;
}

export function TranscriptStrip({
  transcript,
  onCheckIn,
  unavailable,
  emphasis,
}: {
  transcript: TranscriptView;
  onCheckIn(): void;
  unavailable: string | null;
  emphasis: boolean;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const latest = transcript.lines.at(-1);
  return (
    <section
      className="border-border shrink-0 border-b"
      aria-label="Live transcript"
    >
      <div className="flex h-9 items-center gap-2 pr-2 pl-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={open ? "Hide the transcript" : "Show the transcript"}
          className="hover:bg-muted flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[12.5px]"
        >
          <ChevronDown
            aria-hidden
            className={cx(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
              !open && "-rotate-90 rtl:rotate-90",
            )}
          />
          {open ? (
            <span className="text-muted-foreground font-medium">
              Transcript
            </span>
          ) : transcript.pending ? (
            <span
              dir="auto"
              className="text-muted-foreground min-w-0 truncate"
              data-testid="strip-now"
            >
              {transcript.pending}
            </span>
          ) : latest ? (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span
                dir="auto"
                className={cx(
                  "max-w-[40%] shrink-0 truncate font-medium",
                  latest.you ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {latest.speaker}
              </span>
              <span
                dir="auto"
                className="text-muted-foreground min-w-0 truncate"
              >
                {latest.text}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Listening…</span>
          )}
        </button>
        <Tooltip
          label={unavailable ?? "Catch me up"}
          shortcut={unavailable ? undefined : CATCH_UP_SHORTCUT}
          align={TooltipAlign.End}
        >
          <Button
            tone={
              unavailable ? Tone.Ghost : emphasis ? Tone.Primary : Tone.Outline
            }
            onClick={onCheckIn}
            disabled={unavailable !== null}
            aria-keyshortcuts={ariaShortcut(CATCH_UP_SHORTCUT)}
          >
            Catch me up
          </Button>
        </Tooltip>
      </div>
      {open && (
        <TranscriptLog
          id={regionId}
          lines={transcript.lines}
          pending={transcript.pending}
        />
      )}
    </section>
  );
}

function TranscriptLog({
  id,
  lines,
  pending,
}: {
  id: string;
  lines: readonly TranscriptLineView[];
  pending: string;
}) {
  const turns = speakerTurns(lines);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [lines, pending]);
  return (
    <div
      id={id}
      ref={scroller}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}
      className="max-h-[min(40vh,260px)] overflow-y-auto overscroll-contain px-4 pt-1 pb-3"
    >
      {turns.length === 0 && !pending ? (
        <p className="text-muted-foreground py-2 text-[12.5px]">
          Nothing said yet.
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[12.5px] leading-[1.5]">
          {turns.map((turn, index) => {
            const current = index === turns.length - 1;
            return (
              <div key={index} className="contents">
                <dt
                  dir="auto"
                  title={turn.speaker}
                  className={cx(
                    "coach-align-parent line-clamp-2 max-w-24 font-medium [overflow-wrap:anywhere]",
                    turn.you ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {turn.speaker}
                </dt>
                <dd
                  className={cx(
                    "min-w-0 space-y-1",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {turn.texts.map((text, line) => (
                    <p
                      key={line}
                      dir="auto"
                      className="[overflow-wrap:anywhere]"
                    >
                      {text}
                    </p>
                  ))}
                </dd>
              </div>
            );
          })}
          {pending && (
            <div className="contents">
              <dt aria-hidden />
              <dd
                dir="auto"
                className="text-muted-foreground/80 min-w-0 [overflow-wrap:anywhere]"
              >
                {pending}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
