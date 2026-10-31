import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Link2,
  Lock,
  PanelBottom,
  PanelRight,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { CaptureAvailability } from "@anlg/assistant/browser-context";
import { type HeaderSlot } from "@anlg/assistant/ui/components/header";
import {
  Button,
  ButtonSize,
  cx,
  IconButton,
  Tone,
  Tooltip,
  TooltipAlign,
} from "@anlg/assistant/ui/components/primitives";

import { PanelDock } from "../dock";
import { ErrorCode } from "../errors";
import { MeetingPhase } from "../lifecycle";
import {
  AppLinkState,
  ConnectionState,
  RecordingChoice,
  recordingOfferView,
  type PanelState,
} from "../protocol";

export type PanelLayout = { dock: PanelDock; collapsed: boolean };

export type PanelActions = {
  connect(): void;
  disconnect(): void;
  refresh(): void;
  focusMeeting(): void;
  confirmRecording(useCurrent: boolean): void;
  dismissRecording(): void;
  screens(on: boolean): void;
  testHighlight(): void;
  testAttention(): void;
  setDebug(on: boolean): void;
  exportDebug(): void;
  clearDebug(): void;
};

export type CoachSlot = {
  header: HeaderSlot;
  collapse: { collapsed: boolean; onExpand(): void };
};

enum PanelView {
  Main = "main",
  Diagnostics = "diagnostics",
}

enum LinkHealth {
  Online = "online",
  Checking = "checking",
  Offline = "offline",
}

const STALE_AFTER_MS = 15_000;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function linkHealth(state: PanelState | null, now: number) {
  const link = state?.appLink;
  const age = link?.checkedAt ? now - link.checkedAt : null;
  if (
    link?.status === AppLinkState.Online &&
    age !== null &&
    age <= STALE_AFTER_MS
  )
    return { health: LinkHealth.Online, label: "Connected to Cue", age };
  if (link?.status === AppLinkState.Offline)
    return { health: LinkHealth.Offline, label: "Cue is offline", age };
  return {
    health: LinkHealth.Checking,
    label: age !== null ? "Checking connection…" : "Connecting to Cue…",
    age,
  };
}

const DOT = {
  [LinkHealth.Online]: "bg-success",
  [LinkHealth.Checking]: "coach-pulse bg-muted-foreground",
  [LinkHealth.Offline]: "bg-destructive",
};

export function MeetPanel({
  state,
  embedded,
  supportedTab,
  showBackToMeeting,
  busy,
  failure,
  coachIssue,
  debugEnabled,
  layout,
  onLayout,
  actions,
  renderCoach,
}: {
  state: PanelState | null;
  embedded: boolean;
  supportedTab: boolean;
  showBackToMeeting: boolean;
  busy: boolean;
  failure: string | null;
  coachIssue: ErrorCode | null;
  debugEnabled: boolean;
  layout: PanelLayout;
  onLayout(change: Partial<PanelLayout>): void;
  actions: PanelActions;
  renderCoach(slot: CoachSlot): ReactNode;
}) {
  const [view, setView] = useState(PanelView.Main);
  const connected = state?.connection === ConnectionState.Connected;
  const collapsed = embedded && layout.collapsed;
  const controls = embedded && (
    <>
      <DockSwitch dock={layout.dock} onDock={(dock) => onLayout({ dock })} />
      <IconButton
        label="Minimize coach"
        tooltipAlign={TooltipAlign.End}
        onClick={() => onLayout({ collapsed: true })}
      >
        <ChevronDown aria-hidden className="size-4" />
      </IconButton>
    </>
  );
  const diagnostics = view === PanelView.Diagnostics && !collapsed && (
    <Diagnostics
      state={state}
      debugEnabled={debugEnabled}
      actions={actions}
      onBack={() => setView(PanelView.Main)}
    />
  );

  if (connected)
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        {coachIssue && !collapsed && (
          <p
            role="status"
            className="border-border text-muted-foreground shrink-0 border-b px-3 py-1.5 text-[12px]"
          >
            {coachIssue} — Cue is reachable, but meeting chat is unavailable.
            Retrying automatically.
          </p>
        )}
        <div
          hidden={view === PanelView.Diagnostics && !collapsed}
          className="flex min-h-0 flex-1 flex-col"
        >
          {renderCoach({
            header: {
              actions: (
                <>
                  <PrivacyMark />
                  {controls}
                </>
              ),
              menu: (
                <>
                  <MenuButton onClick={actions.disconnect}>
                    <Unlink aria-hidden className="size-3.5" />
                    Disconnect meeting
                  </MenuButton>
                  <MenuButton onClick={() => setView(PanelView.Diagnostics)}>
                    <Activity aria-hidden className="size-3.5" />
                    Diagnostics
                  </MenuButton>
                </>
              ),
            },
            collapse: {
              collapsed,
              onExpand: () => onLayout({ collapsed: false }),
            },
          })}
        </div>
        {diagnostics}
      </div>
    );

  if (collapsed)
    return (
      <IdleStrip
        state={state}
        supportedTab={supportedTab}
        busy={busy}
        onConnect={actions.connect}
        onExpand={() => onLayout({ collapsed: false })}
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {diagnostics || (
        <>
          <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b ps-3 pe-2">
            <img src="cue-mark.svg" alt="" className="size-4 shrink-0" />
            <span className="text-[13.5px] font-semibold">Coach</span>
            <PrivacyMark labelled />
            <span className="flex-1" />
            <IconButton
              label="Diagnostics"
              onClick={() => setView(PanelView.Diagnostics)}
            >
              <Activity aria-hidden className="size-3.5" />
            </IconButton>
            {controls}
          </header>
          <IdleBody
            state={state}
            supportedTab={supportedTab}
            showBackToMeeting={showBackToMeeting}
            busy={busy}
            failure={failure}
            actions={actions}
          />
        </>
      )}
    </div>
  );
}

function PrivacyMark({ labelled = false }: { labelled?: boolean }) {
  return (
    <Tooltip label="Only you can see this coach" align={TooltipAlign.End}>
      <span className="text-muted-foreground flex h-7 items-center gap-1 px-1 text-[12px]">
        <Lock aria-hidden className="size-3" />
        <span className={labelled ? undefined : "sr-only"}>Only you</span>
      </span>
    </Tooltip>
  );
}

function DockSwitch({
  dock,
  onDock,
}: {
  dock: PanelDock;
  onDock(dock: PanelDock): void;
}) {
  const options = [
    {
      dock: PanelDock.Bottom,
      label: "Dock above Meet's controls",
      Icon: PanelBottom,
    },
    { dock: PanelDock.Side, label: "Dock at the side", Icon: PanelRight },
  ];
  return (
    <div
      role="group"
      aria-label="Coach position"
      className="bg-muted inline-flex h-7 shrink-0 rounded-md p-0.5"
    >
      {options.map(({ dock: option, label, Icon }) => (
        <Tooltip key={option} label={label} align={TooltipAlign.End}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={dock === option}
            onClick={() => onDock(option)}
            className={cx(
              "grid h-6 w-7 place-items-center rounded-sm transition-colors duration-100",
              dock === option
                ? "bg-surface text-foreground ring-border ring-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      tone={Tone.Ghost}
      onClick={onClick}
      className="w-full justify-start"
    >
      {children}
    </Button>
  );
}

function idleCopy(state: PanelState | null, supportedTab: boolean) {
  if (!supportedTab)
    return "Open a Google Meet call in this window to connect. You can browse other tabs after connecting.";
  if (state?.recordingTitle)
    return `Connect this call to “${state.recordingTitle}”.`;
  return "Start a recording in Cue, then connect this call to chat with your coach.";
}

function IdleStrip({
  state,
  supportedTab,
  busy,
  onConnect,
  onExpand,
}: {
  state: PanelState | null;
  supportedTab: boolean;
  busy: boolean;
  onConnect(): void;
  onExpand(): void;
}) {
  const now = useNow(1_000);
  const link = linkHealth(state, now);
  const offer = state?.recordingOffer;
  const connecting = state?.connection === ConnectionState.Connecting;
  const status = offer
    ? recordingOfferView(offer).question
    : link.health !== LinkHealth.Online
      ? link.label
      : connecting
        ? "Connecting meeting…"
        : "Not connected to this call";
  return (
    <section
      aria-label="Coach"
      className="flex h-full min-h-0 items-center gap-1.5 ps-1.5 pe-1.5"
    >
      <button
        type="button"
        onClick={onExpand}
        className="hover:bg-muted flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-start transition-colors duration-100"
      >
        <img src="cue-mark.svg" alt="" className="size-4 shrink-0" />
        <span className="shrink-0 text-[13.5px] font-semibold">Coach</span>
        <span className="text-muted-foreground min-w-0 truncate text-[13px]">
          {status}
        </span>
      </button>
      {!offer && supportedTab && link.health === LinkHealth.Online && (
        <Button
          tone={Tone.Primary}
          disabled={busy || connecting}
          onClick={onConnect}
        >
          Connect
        </Button>
      )}
      <Button
        tone={Tone.Ghost}
        aria-label="Open coach"
        onClick={onExpand}
        className="size-7 px-0"
      >
        <ChevronUp aria-hidden className="size-4" />
      </Button>
    </section>
  );
}

function IdleBody({
  state,
  supportedTab,
  showBackToMeeting,
  busy,
  failure,
  actions,
}: {
  state: PanelState | null;
  supportedTab: boolean;
  showBackToMeeting: boolean;
  busy: boolean;
  failure: string | null;
  actions: PanelActions;
}) {
  const now = useNow(1_000);
  const link = linkHealth(state, now);
  const offer = state?.recordingOffer;
  const connecting = state?.connection === ConnectionState.Connecting;
  const appIssue = state?.appLink.status === AppLinkState.Offline;
  const message = failure ?? (appIssue ? state?.appLink.error : state?.error);
  const code = failure
    ? ErrorCode.ExtensionRestarted
    : appIssue
      ? state?.appLink.errorCode
      : state?.errorCode;
  return (
    <main className="coach-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-1.5 text-[12px]"
      >
        <span
          aria-hidden
          className={cx("size-1.5 shrink-0 rounded-full", DOT[link.health])}
        />
        {link.label}
      </p>
      {offer ? (
        <RecordingPrompt
          offer={offer}
          disabled={busy || connecting}
          actions={actions}
        />
      ) : (
        <div>
          <h1 className="text-[15px] leading-[22px] font-semibold">
            Your coach, here.
          </h1>
          <p className="text-muted-foreground mt-1 text-[13px] text-balance">
            {idleCopy(state, supportedTab)}
          </p>
        </div>
      )}
      {message && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/[0.06] rounded-lg border px-3 py-2.5"
        >
          <p className="text-[13.5px] font-medium">{message}</p>
          <p className="text-muted-foreground text-[13px]">
            {code ?? ErrorCode.RequestFailed}
          </p>
        </div>
      )}
      {!offer && (
        <div className="flex flex-wrap items-center gap-2">
          {supportedTab && (
            <Button
              tone={Tone.Primary}
              size={ButtonSize.Md}
              disabled={busy || connecting}
              onClick={actions.connect}
            >
              <Link2 aria-hidden className="size-4" />
              {connecting ? "Connecting…" : "Connect meeting"}
            </Button>
          )}
          {showBackToMeeting && (
            <Button size={ButtonSize.Md} onClick={actions.focusMeeting}>
              Back to meeting
            </Button>
          )}
          <IconButton label="Retry connection" onClick={actions.refresh}>
            <RefreshCw aria-hidden className="size-3.5" />
          </IconButton>
        </div>
      )}
      <p className="text-muted-foreground mt-auto text-[12px] text-balance">
        Sharing this Meet tab, window, or screen may show the coach. Minimize it
        before sharing.
      </p>
    </main>
  );
}

function RecordingPrompt({
  offer,
  disabled,
  actions,
}: {
  offer: NonNullable<PanelState["recordingOffer"]>;
  disabled: boolean;
  actions: PanelActions;
}) {
  const view = recordingOfferView(offer);
  const current = view.currentLabel && (
    <Button
      key="current"
      size={ButtonSize.Md}
      tone={
        view.primary === RecordingChoice.Current ? Tone.Primary : Tone.Outline
      }
      disabled={disabled}
      onClick={() => actions.confirmRecording(true)}
    >
      {view.currentLabel}
    </Button>
  );
  const fresh = (
    <Button
      key="new"
      size={ButtonSize.Md}
      tone={view.primary === RecordingChoice.New ? Tone.Primary : Tone.Outline}
      disabled={disabled}
      onClick={() => actions.confirmRecording(false)}
    >
      {view.newLabel}
    </Button>
  );
  return (
    <div>
      <h1 className="text-[15px] leading-[22px] font-semibold">
        {view.question}
      </h1>
      <p className="text-muted-foreground mt-1 text-[13px] text-balance">
        {view.detail}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {view.primary === RecordingChoice.Current
          ? [current, fresh]
          : [fresh, current]}
        <Button
          size={ButtonSize.Md}
          tone={Tone.Ghost}
          disabled={disabled}
          onClick={actions.dismissRecording}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex min-h-7 cursor-pointer items-center justify-between gap-3 text-[13px]">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "inline-flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-150",
          checked ? "bg-warm" : "bg-foreground/45",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked && "translate-x-4 rtl:-translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

function Diagnostics({
  state,
  debugEnabled,
  actions,
  onBack,
}: {
  state: PanelState | null;
  debugEnabled: boolean;
  actions: PanelActions;
  onBack(): void;
}) {
  const now = useNow(1_000);
  const link = linkHealth(state, now);
  const connected = state?.connection === ConnectionState.Connected;
  const coverage = state?.coverage;
  const meeting = connected
    ? state?.phase === MeetingPhase.InMeeting
      ? "Meeting connected"
      : state?.phase === MeetingPhase.Reconnecting
        ? "Meet is reconnecting — context paused"
        : "Meeting state unclear — context paused"
    : state?.connection === ConnectionState.Connecting
      ? "Connecting meeting…"
      : "Meeting not connected";
  const rows: [string, string][] = [
    [
      "Cue",
      link.age === null
        ? `${link.label} · waiting for the first response`
        : `${link.label} · checked ${Math.floor(link.age / 1000)}s ago${state?.appLink.latencyMs != null ? ` · ${state.appLink.latencyMs} ms` : ""}`,
    ],
    ["Meeting", meeting],
    [
      "Captions",
      coverage
        ? coverage.captions === CaptureAvailability.Available
          ? "Available"
          : "Not visible"
        : "—",
    ],
    [
      "Chat",
      coverage
        ? coverage.chat === CaptureAvailability.Available
          ? "Available"
          : "Not visible"
        : "—",
    ],
    ["People seen", coverage ? String(coverage.participants) : "—"],
    [
      "Shared screen",
      !state?.screens
        ? "Off"
        : coverage?.screen
          ? "Captured"
          : "No presentation found",
    ],
  ];
  return (
    <section
      aria-label="Diagnostics"
      className="bg-surface absolute inset-0 z-20 flex min-h-0 flex-col"
    >
      <header className="border-border flex h-11 shrink-0 items-center gap-1.5 border-b ps-1.5 pe-3">
        <IconButton label="Back to the coach" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
        </IconButton>
        <span className="text-[13.5px] font-semibold">Diagnostics</span>
      </header>
      <div className="coach-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground text-[12px]">
          Turn on captions and open chat in Meet to make them available.
        </p>
        <div className="border-border flex flex-col gap-1 border-t pt-3">
          <Switch
            label="Include shared-screen images"
            checked={state?.screens ?? false}
            onChange={actions.screens}
          />
          <Switch
            label="Debug mode"
            checked={debugEnabled}
            onChange={actions.setDebug}
          />
          <p className="text-muted-foreground text-[12px]">
            Extra connection diagnostics only. No meeting content is logged.
            Turning this off clears the log.
          </p>
        </div>
        {debugEnabled && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={actions.testAttention}>Test tooltip</Button>
            <Button onClick={actions.testHighlight}>Test highlight</Button>
            <Button onClick={actions.exportDebug}>Export diagnostics</Button>
            <Button tone={Tone.Ghost} onClick={actions.clearDebug}>
              Clear log
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
