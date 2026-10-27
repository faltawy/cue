import { ChevronDown, Ellipsis, Pause, SquarePen } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { type MeetingCoaching } from "../../coaching-preferences";
import { StripState } from "../../meeting-state";
import { approxUsd, formatUsd } from "../../pricing";
import { ProactiveState, type ProactiveView } from "../../proactive";
import { type TranscriptLineView } from "../../protocol";
import { type CoachProvider, providerName } from "../../provider";
import { formatTokens, type TurnUsage } from "../../usage";
import { Connection, TranscriptView } from "../state";
import { type CoachApi } from "../use-coach";
import { MeetingControls, useMeetingControls } from "./meeting-controls";
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
        className="text-muted-foreground text-[11.5px] tabular-nums"
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

export type HeaderSlot = {
  /** Shown under the title when no connection or recording status applies. */
  subtitle?: ReactNode;
  /** Host controls rendered after the options menu. */
  actions?: ReactNode;
};

export function Header({
  titleOverride,
  provider,
  coaching,
  onCoachingChange,
  connection,
  transcript,
  usage,
  proactive,
  onNewChat,
  newChatDisabled,
  onPalette,
  idleSubtitle,
  actions,
}: {
  titleOverride?: string;
  provider?: CoachProvider;
  coaching?: MeetingCoaching & { sessionId: string };
  onCoachingChange: CoachApi["setCoaching"];
  connection: Connection;
  transcript: TranscriptView | null;
  usage: TurnUsage | null;
  proactive: ProactiveView | null;
  onNewChat: () => void;
  newChatDisabled: boolean;
  onPalette: () => void;
  idleSubtitle?: ReactNode;
  actions?: ReactNode;
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
    titleOverride ??
    (strip?.state === StripState.Live ? strip.title : (endedTitle ?? "Coach"));
  let subtitle: ReactNode = null;
  if (!settled) {
    subtitle = connection === Connection.Lost ? "Reconnecting…" : "Connecting…";
  } else if (strip?.state === StripState.Live && live) {
    subtitle = strip.paused ? (
      "Paused"
    ) : strip.startedAt === null ? (
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
  } else if (idleSubtitle) {
    subtitle = idleSubtitle;
  }
  return (
    <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <span
        aria-hidden
        className={cx(
          "size-2 shrink-0 rounded-full",
          !settled
            ? "coach-pulse bg-muted-foreground"
            : live && strip?.state === StripState.Live && !strip.paused
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
      <HeaderOptions
        key={coaching?.sessionId ?? "no-meeting"}
        provider={provider}
        coaching={coaching}
        onCoachingChange={onCoachingChange}
        proactive={live ? proactive : null}
        longChat={isLongChat(usage)}
        onNewChat={onNewChat}
        disabled={newChatDisabled}
        onPalette={onPalette}
      />
      {actions}
    </header>
  );
}

function HeaderOptions({
  provider,
  coaching,
  onCoachingChange,
  proactive,
  longChat,
  onNewChat,
  disabled,
  onPalette,
}: {
  provider?: CoachProvider;
  coaching?: MeetingCoaching & { sessionId: string };
  onCoachingChange: CoachApi["setCoaching"];
  proactive: ProactiveView | null;
  longChat: boolean;
  onNewChat: () => void;
  disabled: boolean;
  onPalette: () => void;
}) {
  const { result, pending, update } = useMeetingControls(
    coaching?.sessionId,
    onCoachingChange,
  );
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panelRef = useCallback(
    (panel: HTMLDivElement | null) => {
      if (!panel || !open) return;
      panel
        .querySelector<HTMLElement>(
          "select:not(:disabled), button:not(:disabled)",
        )
        ?.focus();
      const dismiss = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !panel.contains(event.target) &&
          !trigger.current?.contains(event.target)
        ) {
          setOpen(false);
        }
      };
      const keyboard = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        } else if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          setOpen(false);
        }
      };
      document.addEventListener("pointerdown", dismiss);
      document.addEventListener("keydown", keyboard, true);
      return () => {
        document.removeEventListener("pointerdown", dismiss);
        document.removeEventListener("keydown", keyboard, true);
      };
    },
    [open],
  );

  const run = (action: () => void) => {
    setOpen(false);
    trigger.current?.focus();
    action();
  };
  const paused =
    proactive?.state === ProactiveState.Capped ||
    proactive?.state === ProactiveState.Unpriced;

  return (
    <>
      {coaching?.quiet && !open ? (
        <Tooltip label="Resume suggestions" align={TooltipAlign.End}>
          <Button
            tone={Tone.Ghost}
            aria-label="Resume suggestions"
            disabled={disabled || pending}
            onClick={() => update({ quiet: false })}
            className="px-1.5"
          >
            <Pause aria-hidden className="size-3" />
            Quiet
          </Button>
        </Tooltip>
      ) : paused ? (
        <span className="text-muted-foreground text-[11.5px]">
          Nudges paused
        </span>
      ) : null}
      <Button
        ref={trigger}
        tone={Tone.Ghost}
        aria-label="Coach options"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative -me-1 px-1.5"
      >
        <Ellipsis aria-hidden className="size-4" />
        {longChat && (
          <span
            aria-hidden
            className="bg-foreground/70 absolute end-0.5 top-1 size-1.5 rounded-full"
          />
        )}
      </Button>
      {!open && result && !result.ok && (
        <span role="alert" className="text-destructive text-[11.5px]">
          {result.message}
        </span>
      )}
      {createPortal(
        <div
          ref={panelRef}
          id={panelId}
          hidden={!open}
          role="dialog"
          aria-label="Coach options"
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== trigger.current
            )
              setOpen(false);
          }}
          className="border-border bg-surface text-foreground fixed end-2 top-10 max-h-[calc(100dvh-48px)] w-[min(292px,calc(100vw-16px))] overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {coaching && (
            <MeetingControls
              coaching={coaching}
              disabled={disabled}
              update={update}
              pending={pending}
              result={result}
            />
          )}
          <Button
            tone={Tone.Ghost}
            onClick={() => run(onNewChat)}
            disabled={disabled}
            aria-label={
              longChat ? "New chat (this chat is getting long)" : "New chat"
            }
            aria-keyshortcuts={ariaShortcut(["mod", "shift", "o"])}
            className="my-0.5 w-full justify-start"
          >
            <SquarePen aria-hidden className="size-3.5" />
            <span className="flex-1 text-start">New chat</span>
            <Kbd keys={["mod", "shift", "o"]} />
          </Button>
          {longChat && (
            <p
              data-testid="long-chat-dot"
              className="text-muted-foreground px-2.5 pb-1 text-[11.5px]"
            >
              This chat is getting long.
            </p>
          )}
          <Button
            tone={Tone.Ghost}
            onClick={() => run(onPalette)}
            aria-keyshortcuts={ariaShortcut(["mod", "k"])}
            className="w-full"
          >
            <span className="flex-1 text-start">Actions</span>
            <Kbd keys={["mod", "k"]} />
          </Button>
          {(provider || proactive) && (
            <div className="border-border text-muted-foreground mt-1 border-t px-2.5 py-2 text-[11.5px]">
              {provider && <p>{providerName(provider)}</p>}
              {proactive && <ProactiveBudget view={proactive} />}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
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
