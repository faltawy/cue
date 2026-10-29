import { AttentionTarget, attentionSchema } from "@anlg/assistant/attention";

import { adapterFor } from "./adapters";
import { mountCoachPanel } from "./embedded-panel";
import { MeetingPhase } from "./lifecycle";
import { ContentAction } from "./protocol";
import { visualTargets } from "./visual-targets";

const scope = globalThis as typeof globalThis & {
  cueMeetingCleanup?: () => void;
};
scope.cueMeetingCleanup?.();
const panel = mountCoachPanel();
let adapter = adapterFor(location.href);
let reader = adapter?.createReader();
let generation: string | null = null;
let screens = true;
let collectVisualTargets = false;
let timer: ReturnType<typeof setInterval> | null = null;
let observer: MutationObserver | null = null;
let dirty = true;
let lastSnapshot = 0;
let lastScreen = 0;
let lastRead = 0;
let presentation: ReturnType<NonNullable<typeof adapter>["presentation"]> =
  null;
let sending = false;
let sourceUrl: string | null = null;
let phase = MeetingPhase.Unknown;

function stop() {
  generation = null;
  if (timer) clearInterval(timer);
  timer = null;
  observer?.disconnect();
  observer = null;
  reader = undefined;
  presentation = null;
  phase = MeetingPhase.Unknown;
}
async function sample() {
  if (!generation || !adapter || !reader || sending) return;
  const currentUrl = new URL(location.href);
  if (
    !adapter.match(currentUrl) ||
    `${currentUrl.origin}${currentUrl.pathname}` !== sourceUrl
  ) {
    const ended = generation;
    stop();
    await chrome.runtime
      .sendMessage({ kind: ContentAction.Ended, generation: ended })
      .catch(() => undefined);
    return;
  }
  const currentPhase = adapter.phase(document);
  if (currentPhase !== phase) {
    phase = currentPhase;
    await chrome.runtime
      .sendMessage({ kind: ContentAction.Phase, generation, phase })
      .catch(() => stop());
  }
  if (phase === MeetingPhase.Ended || phase === MeetingPhase.Lobby) {
    const ended = generation;
    stop();
    await chrome.runtime
      .sendMessage({ kind: ContentAction.Ended, generation: ended })
      .catch(() => undefined);
    return;
  }
  if (phase !== MeetingPhase.InMeeting || !generation || !reader) {
    presentation = null;
    return;
  }
  const now = Date.now();
  if (!dirty && now - lastSnapshot < 5000) return;
  sending = true;
  try {
    if (screens && now - lastScreen >= 5000) {
      try {
        presentation = adapter.presentation(document);
      } catch {
        presentation = null;
        console.warn("cue_presentation_unavailable");
      }
      lastScreen = now;
    }
    if (!screens) presentation = null;
    const context = reader.read(document);
    if (collectVisualTargets) context.visual_targets = visualTargets(document);
    context.presentation = presentation;
    await chrome.runtime.sendMessage({
      kind: ContentAction.Snapshot,
      generation,
      meeting_url: sourceUrl,
      context,
    });
    dirty = false;
    lastSnapshot = now;
  } catch {
    stop();
  } finally {
    sending = false;
  }
}
const handleMessage: Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0] = (message: unknown, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message !== "object" ||
    !("kind" in message)
  )
    return false;
  if (
    message.kind === ContentAction.TestAttention ||
    message.kind === ContentAction.TestHighlight
  ) {
    panel.minimize();
    panel.attention({
      id: crypto.randomUUID(),
      target:
        message.kind === ContentAction.TestHighlight
          ? AttentionTarget.Captions
          : AttentionTarget.Coach,
      line:
        message.kind === ContentAction.TestHighlight
          ? "Test highlight — this points to Meet’s captions control without clicking it."
          : "Test cue — important suggestions will appear here while your coach is minimized.",
      expiresAt: Date.now() + 12_000,
      automatic: false,
    });
    respond({ shown: true });
    return false;
  }
  if (message.kind === ContentAction.OpenPanel) {
    panel.open();
    respond({ opened: true });
    return false;
  }
  if (message.kind === ContentAction.Probe) {
    respond({
      phase: adapterFor(location.href)?.phase(document) ?? MeetingPhase.Unknown,
    });
    return false;
  }
  if (!("generation" in message) || typeof message.generation !== "string")
    return false;
  if (message.kind === ContentAction.Attention) {
    if (generation === message.generation && "attention" in message) {
      const parsed = attentionSchema.safeParse(message.attention);
      if (parsed.success) panel.attention(parsed.data);
    }
    return false;
  }
  if (message.kind === ContentAction.Stop) {
    if (generation === message.generation) stop();
    respond({ stopped: true });
    return false;
  }
  const nextAdapter = adapterFor(location.href);
  if (message.kind !== ContentAction.Start || !nextAdapter) return false;
  if (generation !== message.generation) {
    stop();
    adapter = nextAdapter;
    reader = adapter.createReader();
    generation = message.generation;
    const url = new URL(location.href);
    sourceUrl = `${url.origin}${url.pathname}`;
    lastSnapshot = 0;
    lastScreen = 0;
    observer = new MutationObserver(() => {
      dirty = true;
      // Retain caption updates between network snapshots without scanning on every video mutation.
      if (
        Date.now() - lastRead >= 100 &&
        adapter?.phase(document) === MeetingPhase.InMeeting
      ) {
        reader?.read(document);
        lastRead = Date.now();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "data-is-speaking",
        "data-is-presenting",
        "data-hand-raised",
      ],
    });
    timer = setInterval(() => void sample(), 1000);
  }
  collectVisualTargets =
    "visualTargets" in message && message.visualTargets === true;
  screens = "screens" in message && message.screens === true;
  dirty = true;
  void sample();
  respond({ started: true });
  return false;
};
chrome.runtime.onMessage.addListener(handleMessage);
const handlePageHide = () => {
  const ended = generation;
  stop();
  if (ended)
    void chrome.runtime
      .sendMessage({ kind: ContentAction.Ended, generation: ended })
      .catch(() => undefined);
};
window.addEventListener("pagehide", handlePageHide);
let observationPending = false;
const observeMeeting = async () => {
  if (observationPending) return;
  observationPending = true;
  try {
    await chrome.runtime.sendMessage({
      kind: ContentAction.Observe,
      phase: adapterFor(location.href)?.phase(document) ?? MeetingPhase.Unknown,
      visible: !document.hidden,
    });
  } catch {
    clearInterval(observationTimer);
    scope.cueMeetingCleanup?.();
  } finally {
    observationPending = false;
  }
};
const observationTimer = setInterval(() => void observeMeeting(), 3000);
void observeMeeting();
scope.cueMeetingCleanup = () => {
  clearInterval(observationTimer);
  panel.close();
  stop();
  chrome.runtime.onMessage.removeListener(handleMessage);
  window.removeEventListener("pagehide", handlePageHide);
};
