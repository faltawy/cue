import { useQuery } from "@tanstack/react-query";
import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { useReducer, useState } from "react";

import { commands as miscCommands } from "@anlg/plugin-misc";
import { Copy, Minus } from "@anlg/ui/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";
import { cn } from "@anlg/utils";

import {
  DEVTOOLS_MENU,
  type DevtoolsAction,
  useDevtoolsActions,
} from "./actions";
import { copyDiagnostics } from "./diagnostics";
import { Hint } from "./hint";
import { MenuGroup, MenuHint } from "./menu";
import {
  type DevtoolsMetrics,
  formatBytes,
  getTopIpcCommands,
  HISTORY_LENGTH,
  startDevtoolsMetrics,
  useDevtoolsMetrics,
} from "./metrics";
import { QuickSettingsMenu } from "./quick-settings";
import { ReactScanControls } from "./react-scan-controls";
import { useReactToolsState, setReactOutlinesEnabled } from "./react-tools";
import {
  areRenderOutlinesEnabled,
  getTopRenderedComponents,
  ignoreRenderTracking,
  setRenderOutlinesEnabled,
} from "./render-tracker";

import { BuildChannel, Tone } from "~/devtools-bar/enums";
import { commands } from "~/types/tauri.gen";

function resolveBuildChannel(identifier: string): BuildChannel {
  if (identifier.endsWith(".nightly")) return BuildChannel.Nightly;
  if (identifier.endsWith(".staging")) return BuildChannel.Staging;
  if (identifier.endsWith(".dev")) return BuildChannel.Dev;
  return BuildChannel.Stable;
}

const CHANNEL_DOT: Record<BuildChannel, string> = {
  dev: "bg-warm",
  staging: "bg-muted-foreground",
  nightly: "bg-muted-foreground",
  stable: "bg-foreground",
};

const CHANNEL_TEXT: Record<BuildChannel, string> = {
  dev: "text-foreground",
  staging: "text-foreground",
  nightly: "text-foreground",
  stable: "text-foreground",
};

const COLLAPSED_STORAGE_KEY = "cue:devtools-bar:collapsed";

const ITEM_CLASS = "flex items-center gap-1.5 px-2";
const BUTTON_CLASS = cn([
  ITEM_CLASS,
  "hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden",
  "data-[state=open]:bg-accent",
]);
const LABEL_CLASS = "text-muted-foreground";
const VALUE_CLASS = "tabular-nums text-foreground";

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-foreground",
  warn: "text-warm-strong",
  bad: "text-destructive",
};

/**
 * Linear-style status bar for dev and staging builds. Stable builds never
 * render it (`show_devtool` is false there), so copy stays English-only.
 */
export function DevtoolsStatusBar(props: Record<never, never>) {
  ignoreRenderTracking(props);

  const enabledQuery = useQuery({
    queryKey: ["devtools-panel", "enabled"],
    queryFn: commands.showDevtool,
    staleTime: Infinity,
  });

  if (enabledQuery.data !== true) {
    return null;
  }

  return <DevtoolsStatusBarContent />;
}

function DevtoolsStatusBarContent(props: Record<never, never>) {
  ignoreRenderTracking(props);

  const build = useBuildInfo();
  const { run } = useDevtoolsActions();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (!build) {
    return null;
  }

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Expand developer bar"
        title="Expand developer bar"
        data-testid="devtools-status-bar-collapsed"
        className={cn([
          "dark border-border bg-background h-1.5 w-full shrink-0 border-t",
          "hover:bg-accent focus-visible:outline-hidden",
        ])}
        onClick={toggleCollapsed}
      >
        <span
          className={cn([
            "mx-auto block h-0.5 w-8 rounded-full",
            CHANNEL_DOT[build.channel],
          ])}
        />
      </button>
    );
  }

  return (
    <footer
      aria-label="Developer status bar"
      data-testid="devtools-status-bar"
      data-devbar=""
      className={cn([
        "dark flex h-6 shrink-0 items-stretch select-none",
        "border-border bg-background text-foreground border-t",
        "text-caption font-mono leading-none",
      ])}
    >
      <DevtoolsMenu onAction={run}>
        <button
          type="button"
          title="Devtools actions"
          className={cn([BUTTON_CLASS, "ps-2.5"])}
        >
          <span
            className={cn([
              "size-1.5 rounded-full",
              CHANNEL_DOT[build.channel],
            ])}
          />
          <span
            className={cn([
              "font-semibold tracking-wider uppercase",
              CHANNEL_TEXT[build.channel],
            ])}
          >
            {build.channel}
          </span>
          <span className="text-muted-foreground">
            {build.version}
            {build.hash ? ` ${build.hash}` : ""}
          </span>
        </button>
      </DevtoolsMenu>

      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <LiveMetrics />
      </div>

      <ReactScanControls />
      <Hint content="Copy a diagnostics snapshot (build, device, metrics, top commands and components, sync) as JSON">
        <button
          type="button"
          aria-label="Copy diagnostics"
          className={BUTTON_CLASS}
          onClick={() => void copyDiagnostics()}
        >
          <Copy size={12} aria-hidden="true" />
        </button>
      </Hint>
      <Hint content="Collapse the developer bar">
        <button
          type="button"
          aria-label="Collapse developer bar"
          className={cn([BUTTON_CLASS, "pe-2.5"])}
          onClick={toggleCollapsed}
        >
          <Minus size={12} aria-hidden="true" />
        </button>
      </Hint>
    </footer>
  );
}

function readCollapsed(): boolean {
  try {
    return (
      (localStorage.getItem(COLLAPSED_STORAGE_KEY) ??
        localStorage.getItem("anarlog:devtools-bar:collapsed")) !== "0"
    );
  } catch {
    return true;
  }
}

// Isolated so the once-per-second metrics tick only re-renders the metrics,
// not the menu and dialogs above.
function LiveMetrics() {
  useMountEffect(() => startDevtoolsMetrics());

  const metrics = useDevtoolsMetrics();
  const [, refresh] = useReducer((tick: number) => tick + 1, 0);

  const fps = last(metrics.fps);
  const jank = last(metrics.jank) ?? 0;
  const delay = last(metrics.delay) ?? 0;
  const invokes = last(metrics.invokes) ?? 0;
  const callbacks = last(metrics.callbacks) ?? 0;
  const renders = last(metrics.renders) ?? 0;
  const memoryBytes = last(metrics.memoryBytes);
  const reactTools = useReactToolsState();
  const outlinesEnabled = reactTools.available
    ? reactTools.outlinesEnabled
    : areRenderOutlinesEnabled();
  const fpsTarget = Math.max(60, ...metrics.fps);

  return (
    <>
      <Metric
        label="FPS"
        value={fps ?? "–"}
        tone={
          fps === undefined
            ? Tone.Ok
            : toneBelow(fps, fpsTarget * 0.8, fpsTarget * 0.5)
        }
        chart={<Sparkline values={metrics.fps} floor={60} />}
        tooltip={
          <Rows
            title="Frames per second"
            rows={[
              ["avg", `${average(metrics.fps)}`],
              ["min", `${Math.min(...metrics.fps, fps ?? 0)}`],
              ["window", `${metrics.fps.length}s`],
            ]}
          />
        }
      />
      <Metric
        label="Jank"
        value={`${jank}%`}
        tone={toneAbove(jank, 3, 10)}
        chart={<Bars values={metrics.jank} ceiling={20} />}
        tooltip={
          <Rows
            title="Frames over 34ms (a dropped frame at 60Hz)"
            rows={[
              ["avg", `${average(metrics.jank)}%`],
              ["max", `${Math.max(...metrics.jank, 0)}%`],
            ]}
          />
        }
      />
      <Metric
        label="Delay"
        value={`${delay}ms`}
        tone={toneAbove(delay, 60, 200)}
        tooltip={
          <Rows
            title="Worst main-thread stall in the last second"
            rows={[
              ["avg", `${average(metrics.delay)}ms`],
              ["max", `${Math.max(...metrics.delay, 0)}ms`],
            ]}
          />
        }
      />
      <Metric
        as="button"
        label="Renders"
        value={renders}
        chart={<Sparkline values={metrics.renders} />}
        trailing={
          <span
            className={
              outlinesEnabled ? "text-foreground" : "text-muted-foreground"
            }
          >
            {outlinesEnabled ? "◉" : "○"}
          </span>
        }
        onClick={() => {
          if (reactTools.available) setReactOutlinesEnabled(!outlinesEnabled);
          else setRenderOutlinesEnabled(!outlinesEnabled);
          refresh();
        }}
        tooltip={
          <Rows
            title={`React renders per second · outlines ${outlinesEnabled ? "on" : "off"} (click to toggle)`}
            rows={getTopRenderedComponents().map(({ name, count }) => [
              name,
              `×${count}`,
            ])}
            empty="No renders in the last 10s"
          />
        }
      />
      <Metric
        label="IPC"
        value={`↑${invokes} ↓${callbacks}`}
        chart={
          <Sparkline
            values={metrics.invokes.map(
              (value, index) => value + (metrics.callbacks[index] ?? 0),
            )}
          />
        }
        tooltip={
          <Rows
            title="Tauri IPC per second · ↑ invokes · ↓ callbacks (responses, events, channels)"
            rows={getTopIpcCommands().map(({ command, count }) => [
              command,
              `×${count}`,
            ])}
            empty="No invokes in the last 10s"
          />
        }
      />
      <Metric
        label="Net"
        value={metrics.requestsInFlight}
        tooltip={
          <Rows
            title="HTTP requests in flight (IPC excluded)"
            rows={[
              ["last second", `${last(metrics.requests) ?? 0}`],
              [
                "window total",
                `${metrics.requests.reduce((a, b) => a + b, 0)}`,
              ],
            ]}
          />
        }
      />
      <Metric
        label="Mem"
        value={memoryBytes === undefined ? "–" : formatBytes(memoryBytes)}
        chart={<Sparkline values={metrics.memoryBytes} relative />}
        tooltip={
          <Rows
            title="Host process resident memory (WebKit renders in a separate process on macOS)"
            rows={[
              [
                "min",
                formatBytes(Math.min(...metrics.memoryBytes, memoryBytes ?? 0)),
              ],
              ["max", formatBytes(Math.max(...metrics.memoryBytes, 0))],
              ["change", describeChange(metrics.memoryBytes)],
            ]}
          />
        }
      />
    </>
  );
}

function describeChange(history: DevtoolsMetrics["memoryBytes"]): string {
  if (history.length < 2) return "–";
  const delta = history[history.length - 1]! - history[0]!;
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${formatBytes(Math.abs(delta))} over ${history.length * 2}s`;
}

function Metric(props: {
  as?: "div" | "button";
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  chart?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  tooltip: React.ReactNode;
}) {
  const {
    as = "div",
    label,
    value,
    tone = Tone.Ok,
    chart,
    trailing,
    onClick,
  } = props;

  const content = (
    <>
      <span className={LABEL_CLASS}>{label}</span>
      <span className={cn([VALUE_CLASS, TONE_CLASS[tone]])}>{value}</span>
      {chart}
      {trailing}
    </>
  );

  return (
    <Hint content={props.tooltip}>
      {as === "button" ? (
        <button type="button" className={BUTTON_CLASS} onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className={ITEM_CLASS}>{content}</div>
      )}
    </Hint>
  );
}

function Rows(props: {
  title?: string;
  rows: Array<[string, string]>;
  empty?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {props.title ? (
        <div className="text-muted-foreground max-w-72">{props.title}</div>
      ) : null}
      {props.rows.length ? (
        <table className="tabular-nums">
          <tbody>
            {props.rows.map(([key, value]) => (
              <tr key={key}>
                <td className="text-foreground max-w-64 truncate pe-3">
                  {key}
                </td>
                <td className="text-foreground text-end">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : props.empty ? (
        <div className="text-muted-foreground">{props.empty}</div>
      ) : null}
    </div>
  );
}

function DevtoolsMenu(props: {
  children: React.ReactNode;
  onAction: (action: DevtoolsAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{props.children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-48">
        <QuickSettingsMenu />
        <DropdownMenuSeparator />
        {DEVTOOLS_MENU.map((group) => (
          <MenuGroup
            key={group.label}
            label={group.label}
            description={group.description}
          >
            {group.items.map((item) => (
              <MenuHint key={item.action} description={item.description}>
                <DropdownMenuItem
                  className={cn([item.destructive && "text-destructive"])}
                  onSelect={() => props.onAction(item.action)}
                >
                  {item.label}
                </DropdownMenuItem>
              </MenuHint>
            ))}
          </MenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useBuildInfo() {
  return useQuery({
    queryKey: ["devtools-bar", "build"],
    staleTime: Infinity,
    queryFn: async () => {
      const [identifier, version, hash] = await Promise.all([
        getIdentifier(),
        getVersion(),
        miscCommands.getGitHash(),
      ]);

      return {
        channel: resolveBuildChannel(identifier),
        version,
        hash: hash.status === "ok" ? hash.data.slice(0, 7) : null,
      };
    },
  }).data;
}

function toneAbove(value: number, warn: number, bad: number): Tone {
  if (value > bad) return Tone.Bad;
  if (value > warn) return Tone.Warn;
  return Tone.Ok;
}

function toneBelow(value: number, warn: number, bad: number): Tone {
  if (value < bad) return Tone.Bad;
  if (value < warn) return Tone.Warn;
  return Tone.Ok;
}

const CHART_WIDTH = 36;
const CHART_HEIGHT = 10;

/**
 * `floor` pins the top of the chart to at least that value (e.g. 60 fps).
 * `relative` scales between the window's min and max so slow drifts such as
 * memory growth stay visible instead of flattening against zero.
 */
function Sparkline(props: {
  values: number[];
  floor?: number;
  relative?: boolean;
}) {
  const { values, floor = 1, relative = false } = props;

  if (values.length < 2) {
    return <ChartFrame />;
  }

  const min = relative ? Math.min(...values) : 0;
  const max = relative ? Math.max(...values) : Math.max(floor, ...values);
  const range = max - min;
  const step = CHART_WIDTH / (HISTORY_LENGTH - 1);
  const offset = CHART_WIDTH - (values.length - 1) * step;
  const points = values
    .map((value, index) => {
      const x = offset + index * step;
      const ratio = range === 0 ? 0.5 : (value - min) / range;
      const y = CHART_HEIGHT - 0.5 - ratio * (CHART_HEIGHT - 1);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <ChartFrame>
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </ChartFrame>
  );
}

/** Bar chart clamped to `ceiling`, so small percentages still register. */
function Bars(props: { values: number[]; ceiling: number }) {
  const { values, ceiling } = props;
  const step = CHART_WIDTH / HISTORY_LENGTH;
  const offset = CHART_WIDTH - values.length * step;

  return (
    <ChartFrame>
      {values.map((value, index) => {
        const height = Math.max(
          1,
          (Math.min(value, ceiling) / ceiling) * CHART_HEIGHT,
        );
        return (
          <rect
            key={index}
            x={(offset + index * step).toFixed(1)}
            y={(CHART_HEIGHT - height).toFixed(1)}
            width={Math.max(step - 0.4, 0.4).toFixed(1)}
            height={height.toFixed(1)}
            fill="currentColor"
            opacity={value > 0 ? 1 : 0.25}
          />
        );
      })}
    </ChartFrame>
  );
}

function ChartFrame({ children }: { children?: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      className="text-muted-foreground shrink-0"
    >
      {children}
    </svg>
  );
}

function last(values: number[]): number | undefined {
  return values.length ? values[values.length - 1] : undefined;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}
