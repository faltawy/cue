import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import {
  useId,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { CheckCircle, Info, WarningCircle } from "@anlg/ui/components/icons";
import { appToastSwipeDismissDirection } from "@anlg/ui/lib/toast-gesture";
import { cn } from "@anlg/utils";

import { buttonVariants } from "./button";

export type AppToastTone = "info" | "success" | "warning" | "error";

export type AppToastAction = Readonly<{
  label: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Leave the toast up after `onClick` so the caller can morph it. Defaults to dismissing. */
  dismissOnClick?: boolean;
}>;

export type AppToastOptions = Readonly<{
  id?: string;
  closeButton?: boolean;
  message: ReactNode;
  description?: ReactNode;
  tone?: AppToastTone;
  leading?: ReactNode;
  action?: AppToastAction;
  secondaryAction?: AppToastAction;
  durationMs?: number;
  dismissible?: boolean;
  /** Runs once when the toast starts leaving, whatever dismissed it: the user, the timer, or code. */
  onDismiss?: (reason: "user" | "timer" | "programmatic") => void;
}>;

/** Fields a live toast can morph in place; the rest are fixed at show time. */
export type AppToastUpdate = Readonly<
  Partial<
    Pick<
      AppToastOptions,
      | "message"
      | "description"
      | "tone"
      | "leading"
      | "action"
      | "secondaryAction"
    >
  >
>;

export type AppToastHandle = Readonly<{
  /** Morph the visible toast without re-spawning it. A no-op once it is leaving. */
  update: (changes: AppToastUpdate) => void;
  dismiss: () => void;
}>;

export type AppToastAlign = "center" | "end";

export type AppToasterProps = Readonly<{
  theme?: "light" | "dark" | "system";
  position?: "top" | "bottom";
  /** Horizontal placement of the stack: centered (mobile) or flush right (desktop). */
  align?: AppToastAlign;
  visibleToasts?: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
}>;

type AppToastPhase = "visible" | "exiting";
type AppToastDirection = -1 | 1;

type AppToastItem = Readonly<{
  id: string;
  message: ReactNode;
  description?: ReactNode;
  tone: AppToastTone;
  leading?: ReactNode;
  action?: AppToastAction;
  secondaryAction?: AppToastAction;
  durationMs: number;
  remainingMs: number;
  dismissible: boolean;
  closeButton: boolean;
  onDismiss?: (reason: "user" | "timer" | "programmatic") => void;
  paused: boolean;
  phase: AppToastPhase;
  exitDirection: AppToastDirection;
}>;

type AppToastTimer = Readonly<{
  deadline: number;
  timeoutId: ReturnType<typeof setTimeout>;
  tickId: ReturnType<typeof setInterval>;
}>;

const DEFAULT_APP_TOAST_DURATION_MS = 3_000;
const APP_TOAST_EXIT_DURATION_MS = 220;
const APP_TOAST_TICK_MS = 100;
const APP_TOAST_DESKTOP_HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const APP_TOAST_STACK_OFFSET_PX = 10;
const APP_TOAST_STACK_SCALE_STEP = 0.035;

let nextToastId = 0;
let appToastSnapshot: readonly AppToastItem[] = [];
const appToastListeners = new Set<() => void>();
const appToastTimers = new Map<string, AppToastTimer>();
const appToastExitTimers = new Map<string, ReturnType<typeof setTimeout>>();

function subscribeToAppToasts(listener: () => void): () => void {
  appToastListeners.add(listener);
  return () => appToastListeners.delete(listener);
}

function getAppToastSnapshot(): readonly AppToastItem[] {
  return appToastSnapshot;
}

function publishAppToasts(next: readonly AppToastItem[]): void {
  appToastSnapshot = next;
  appToastListeners.forEach((listener) => listener());
}

function updateAppToast(
  id: string,
  update: (toast: AppToastItem) => AppToastItem,
): void {
  let changed = false;
  const next = appToastSnapshot.map((toast) => {
    if (toast.id !== id) return toast;
    changed = true;
    return update(toast);
  });
  if (changed) publishAppToasts(next);
}

function clearAppToastTimer(id: string): void {
  const timer = appToastTimers.get(id);
  if (!timer) return;
  clearTimeout(timer.timeoutId);
  clearInterval(timer.tickId);
  appToastTimers.delete(id);
}

function removeAppToast(id: string): void {
  clearAppToastTimer(id);
  const exitTimer = appToastExitTimers.get(id);
  if (exitTimer) clearTimeout(exitTimer);
  appToastExitTimers.delete(id);
  publishAppToasts(appToastSnapshot.filter((toast) => toast.id !== id));
}

export function dismissAppToast(
  id: string,
  direction: AppToastDirection = 1,
  reason: "user" | "timer" | "programmatic" = "programmatic",
): void {
  const toast = appToastSnapshot.find((candidate) => candidate.id === id);
  if (!toast || toast.phase === "exiting") return;

  clearAppToastTimer(id);
  updateAppToast(id, (current) => ({
    ...current,
    phase: "exiting",
    exitDirection: direction,
  }));
  appToastExitTimers.set(
    id,
    setTimeout(() => removeAppToast(id), APP_TOAST_EXIT_DURATION_MS),
  );
  toast.onDismiss?.(reason);
}

function updateRemainingTime(id: string): void {
  const timer = appToastTimers.get(id);
  if (!timer) return;
  const remainingMs = Math.max(0, timer.deadline - Date.now());
  updateAppToast(id, (toast) =>
    toast.remainingMs === remainingMs ? toast : { ...toast, remainingMs },
  );
}

function startAppToastTimer(id: string, remainingMs: number): void {
  if (!Number.isFinite(remainingMs)) return;

  const safeRemainingMs = Math.max(0, remainingMs);
  const deadline = Date.now() + safeRemainingMs;
  const timeoutId = setTimeout(
    () => dismissAppToast(id, 1, "timer"),
    safeRemainingMs,
  );
  const tickId = setInterval(() => updateRemainingTime(id), APP_TOAST_TICK_MS);
  appToastTimers.set(id, { deadline, timeoutId, tickId });
}

function toggleAppToastTimer(id: string): void {
  const toast = appToastSnapshot.find((candidate) => candidate.id === id);
  if (!toast || !Number.isFinite(toast.durationMs) || toast.phase === "exiting")
    return;

  if (toast.paused) {
    updateAppToast(id, (current) => ({ ...current, paused: false }));
    startAppToastTimer(id, toast.remainingMs);
    return;
  }

  const timer = appToastTimers.get(id);
  const remainingMs = timer
    ? Math.max(0, timer.deadline - Date.now())
    : toast.remainingMs;
  clearAppToastTimer(id);
  updateAppToast(id, (current) => ({ ...current, paused: true, remainingMs }));
}

function subscribeToDesktopHover(listener: () => void) {
  const query = window.matchMedia?.(APP_TOAST_DESKTOP_HOVER_QUERY);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function getDesktopHoverSnapshot() {
  return window.matchMedia?.(APP_TOAST_DESKTOP_HOVER_QUERY).matches ?? false;
}

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * App-wide toast viewport shared by desktop and web.
 * Mount once per renderer root; feedback is published through
 * `showAppToast` and friends.
 */
export function AppToaster({
  theme = "system",
  position = "bottom",
  align = "center",
  visibleToasts = 4,
  gap = 8,
  className,
  style,
}: AppToasterProps) {
  const toasts = useSyncExternalStore(
    subscribeToAppToasts,
    getAppToastSnapshot,
    getAppToastSnapshot,
  );
  const [desktopStackExpanded, setDesktopStackExpanded] = useState(false);
  const visibleToastItems = toasts.slice(-visibleToasts);
  const supportsDesktopHover = useSyncExternalStore(
    subscribeToDesktopHover,
    getDesktopHoverSnapshot,
    getServerSnapshot,
  );
  const isClient = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
  const stacked =
    supportsDesktopHover &&
    visibleToastItems.length > 1 &&
    !desktopStackExpanded;

  const expandDesktopStack = () => {
    if (supportsDesktopHover) setDesktopStackExpanded(true);
  };
  const collapseDesktopStack = () => {
    if (supportsDesktopHover) setDesktopStackExpanded(false);
  };
  const handleStackBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget))
      collapseDesktopStack();
  };

  if (!isClient) return null;

  return createPortal(
    <div
      data-slot="app-toaster"
      data-app-toaster=""
      data-theme={theme}
      data-x-position={align}
      data-y-position={position}
      aria-live="polite"
      aria-relevant="additions"
      className={cn([
        "pointer-events-none fixed inset-x-0 isolate z-50 flex",
        align === "end"
          ? "justify-end pe-[max(1rem,env(safe-area-inset-right))]"
          : "justify-center",
        position === "top"
          ? "top-[max(1rem,env(safe-area-inset-top))] items-start"
          : "bottom-[max(1rem,env(safe-area-inset-bottom))] items-end",
        theme === "dark" ? "dark" : undefined,
        className,
      ])}
      style={style}
    >
      <motion.div
        layout
        data-slot="app-toast-stack"
        data-app-toast-stack=""
        data-hover-capable={supportsDesktopHover}
        data-stacked={stacked}
        onMouseEnter={expandDesktopStack}
        onMouseLeave={collapseDesktopStack}
        onFocusCapture={expandDesktopStack}
        onBlurCapture={handleStackBlur}
        className={cn([
          "pointer-events-auto relative w-fit",
          stacked ? "grid" : "flex flex-col",
        ])}
        style={{ gap }}
      >
        {visibleToastItems.map((toast, index) => {
          const stackDepth = visibleToastItems.length - index - 1;
          return (
            <AppToast
              key={toast.id}
              toast={toast}
              stackDepth={stackDepth}
              stacked={stacked}
            />
          );
        })}
      </motion.div>
    </div>,
    document.body,
  );
}

export function showAppToast({
  id = `app-toast-${++nextToastId}`,
  closeButton = true,
  message,
  description,
  tone = "info",
  leading,
  action,
  secondaryAction,
  durationMs = DEFAULT_APP_TOAST_DURATION_MS,
  dismissible = true,
  onDismiss,
}: AppToastOptions): AppToastHandle {
  clearAppToastTimer(id);
  const exitTimer = appToastExitTimers.get(id);
  if (exitTimer) clearTimeout(exitTimer);
  appToastExitTimers.delete(id);
  const normalizedDurationMs = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : durationMs;
  const toast: AppToastItem = {
    id,
    message,
    description,
    tone,
    leading,
    action,
    secondaryAction,
    durationMs: normalizedDurationMs,
    remainingMs: normalizedDurationMs,
    dismissible,
    closeButton,
    onDismiss,
    paused: false,
    phase: "visible",
    exitDirection: 1,
  };

  publishAppToasts(
    appToastSnapshot.some((item) => item.id === id)
      ? appToastSnapshot.map((item) => (item.id === id ? toast : item))
      : [...appToastSnapshot, toast],
  );
  startAppToastTimer(id, normalizedDurationMs);

  return {
    update: (changes) =>
      updateAppToast(id, (current) =>
        current.phase === "exiting" ? current : { ...current, ...changes },
      ),
    dismiss: () => dismissAppToast(id),
  };
}

export function showErrorToast(message: string): AppToastHandle {
  return showAppToast({ message, tone: "error" });
}

export function showSuccessToast(message: string): AppToastHandle {
  return showAppToast({ message, tone: "success" });
}

export function dismissAppToasts(): void {
  const leaving = appToastSnapshot.filter((toast) => toast.phase === "visible");
  appToastTimers.forEach((_, id) => clearAppToastTimer(id));
  appToastExitTimers.forEach((timer) => clearTimeout(timer));
  appToastExitTimers.clear();
  publishAppToasts([]);
  leaving.forEach((toast) => toast.onDismiss?.("programmatic"));
}

type AppToastProps = Readonly<{
  toast: AppToastItem;
  stackDepth: number;
  stacked: boolean;
}>;

function AppToast({ toast, stackDepth, stacked }: AppToastProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const hasTimer = Number.isFinite(toast.durationMs);
  const hasDetails = hasTimer || toast.description !== undefined;
  const secondaryAction =
    toast.secondaryAction ??
    (toast.closeButton && toast.dismissible
      ? { label: "Dismiss", onClick: () => {} }
      : undefined);
  const actions = [toast.action, secondaryAction].filter(
    (action): action is AppToastAction => action !== undefined,
  );
  const stackedBehind = stacked && stackDepth > 0;
  const visuallyExpanded = expanded && !stackedBehind;
  const stackScale = Math.max(
    0.88,
    1 - stackDepth * APP_TOAST_STACK_SCALE_STEP,
  );
  const exitDistance =
    typeof window === "undefined" ? 1_024 : window.innerWidth + 256;
  const progress =
    hasTimer && toast.durationMs > 0
      ? Math.max(0, Math.min(1, toast.remainingMs / toast.durationMs))
      : 0;

  const dismiss = (direction: AppToastDirection = 1) =>
    dismissAppToast(toast.id, direction, "user");
  const handleDragEnd = (
    _event: globalThis.MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (!toast.dismissible) return;
    const direction = appToastSwipeDismissDirection(
      info.offset.x,
      info.velocity.x,
    );
    if (direction !== undefined) dismiss(direction);
  };

  return (
    <motion.div
      layout
      role={toast.tone === "error" ? "alert" : "status"}
      data-slot="app-toast"
      data-app-toast=""
      data-tone={toast.tone}
      data-expanded={visuallyExpanded}
      data-phase={toast.phase}
      data-exit-direction={toast.exitDirection}
      data-stack-depth={stackDepth}
      data-stacked-behind={stackedBehind}
      inert={stackedBehind}
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }}
      animate={
        toast.phase === "exiting"
          ? {
              opacity: 0,
              x: toast.exitDirection * exitDistance,
              scale: 0.96,
            }
          : {
              opacity: 1,
              x: 0,
              y: stacked ? -stackDepth * APP_TOAST_STACK_OFFSET_PX : 0,
              scale: stacked ? stackScale : 1,
            }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.18, ease: "easeOut" },
              x: {
                duration: APP_TOAST_EXIT_DURATION_MS / 1_000,
                ease: [0.4, 0, 1, 1],
              },
              y: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 0.2, ease: "easeOut" },
            }
      }
      drag={toast.dismissible && toast.phase === "visible" ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onClick={(event) => {
        if (
          hasDetails &&
          event.target instanceof Element &&
          !event.target.closest(
            "button, a, input, textarea, select, [role='button'], [contenteditable='true']",
          )
        ) {
          setExpanded((current) => !current);
        }
      }}
      whileDrag={reduceMotion ? undefined : { scale: 0.985 }}
      className={cn([
        "no-drag pointer-events-auto col-start-1 row-start-1 mx-auto origin-top touch-pan-y self-start select-none",
        "w-[min(22rem,calc(100vw-2rem))] overflow-hidden",
        "bg-popover text-popover-foreground border-border rounded-lg border shadow-lg",
        toast.dismissible && toast.phase === "visible"
          ? "cursor-grab active:cursor-grabbing"
          : null,
        toast.phase === "exiting" || stackedBehind
          ? "pointer-events-none"
          : null,
      ])}
      style={{ zIndex: stackDepth === 0 ? 10 : 10 - stackDepth }}
    >
      <div className="relative p-3">
        <button
          type="button"
          aria-label={
            hasDetails
              ? visuallyExpanded
                ? "Collapse notification"
                : "Expand notification"
              : undefined
          }
          aria-expanded={hasDetails ? visuallyExpanded : undefined}
          aria-controls={hasDetails ? detailsId : undefined}
          disabled={!hasDetails}
          onClick={() => setExpanded((current) => !current)}
          className={cn([
            "flex w-full items-start gap-2.5 rounded-sm text-start",
            hasDetails ? "cursor-pointer" : "cursor-default",
          ])}
        >
          {/* The slot sizes the glyph, so callers only pass color. */}
          <span
            data-slot="app-toast-leading"
            className="mt-px flex size-4 shrink-0 items-center justify-center [&>svg]:size-4"
            aria-hidden
          >
            {toast.leading ?? <AppToastToneIcon tone={toast.tone} />}
          </span>
          <span
            data-slot="app-toast-message"
            className="text-ui min-w-0 flex-1 font-medium break-words whitespace-normal"
          >
            {toast.message}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {visuallyExpanded && toast.description !== undefined ? (
            <motion.div
              id={detailsId}
              key="details"
              data-slot="app-toast-details"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.16, ease: "easeOut" },
                    }
              }
              className="overflow-hidden"
            >
              <div className="text-label text-muted-foreground ps-6.5 pt-0.5">
                {toast.description}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {!stackedBehind && actions.length > 0 ? (
          <div
            data-slot="app-toast-actions"
            className="flex items-center gap-2 ps-6.5 pt-2.5"
          >
            {actions.map((action, index) => (
              <button
                key={index}
                type="button"
                onClick={(event) => {
                  try {
                    action.onClick(event);
                  } finally {
                    if (
                      !event.defaultPrevented &&
                      action.dismissOnClick !== false
                    )
                      dismiss();
                  }
                }}
                className={buttonVariants({
                  size: "sm",
                  variant: action === toast.action ? "default" : "outline",
                })}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {visuallyExpanded && hasTimer ? (
        <button
          type="button"
          id={toast.description === undefined ? detailsId : undefined}
          aria-label={
            toast.paused ? "Resume auto-dismiss" : "Pause auto-dismiss"
          }
          onClick={() => toggleAppToastTimer(toast.id)}
          className={cn([
            "border-border text-caption text-muted-foreground relative flex h-7 w-full items-center justify-between gap-3 border-t px-3 text-start",
            "hover:bg-muted transition-[background-color] duration-100 focus-visible:-outline-offset-2",
          ])}
        >
          <span aria-hidden>
            {toast.paused ? "Timer paused" : "Closing in"}{" "}
            <span className="text-foreground font-medium tabular-nums">
              {Math.max(0, Math.ceil(toast.remainingMs / 1_000))}
            </span>{" "}
            {Math.ceil(toast.remainingMs / 1_000) === 1 ? "second" : "seconds"}
          </span>
          <span aria-hidden className="text-foreground font-medium">
            {toast.paused ? "Resume" : "Pause"}
          </span>
          <motion.span
            aria-hidden
            data-slot="app-toast-progress"
            className={cn([
              "absolute inset-x-0 bottom-0 h-0.5 origin-left rtl:origin-right",
              toast.tone === "error"
                ? "bg-destructive"
                : toast.tone === "success"
                  ? "bg-success"
                  : "bg-foreground/30",
            ])}
            initial={false}
            animate={{ scaleX: progress }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.1, ease: "linear" }
            }
          />
        </button>
      ) : null}
    </motion.div>
  );
}

function AppToastToneIcon({ tone }: Readonly<{ tone: AppToastTone }>) {
  switch (tone) {
    case "success":
      return <CheckCircle className="text-success" />;
    case "warning":
      return <WarningCircle className="text-warm-strong" />;
    case "error":
      return <WarningCircle className="text-destructive" />;
    case "info":
      return <Info className="text-muted-foreground" />;
  }
}
