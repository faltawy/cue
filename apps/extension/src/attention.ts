import { annotate, type Annotation } from "@shardsui/notation";

import { AttentionTarget, type Attention } from "@anlg/assistant/attention";

import { adapterFor } from "./adapters";
import { MeetingPhase } from "./lifecycle";
import { presentationVideo } from "./meet";
import { visualTarget } from "./visual-targets";

export function createAttentionLayer(
  coachButton: HTMLElement,
  isExpanded: () => boolean = () => false,
) {
  let layer: HTMLElement | undefined;
  let drawing: Annotation | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let lastAutomatic = -Infinity;
  const seen = new Set<string>();
  const clear = () => {
    clearInterval(timer);
    clearTimeout(expiry);
    drawing?.remove();
    drawing = undefined;
    layer?.remove();
    layer = undefined;
  };
  const dismiss = () => {
    lastAutomatic = Date.now();
    clear();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };
  const hidden = () => {
    if (document.hidden) clear();
  };
  window.addEventListener("keydown", escape);
  document.addEventListener("visibilitychange", hidden);

  return {
    clear,
    show(cue: Attention) {
      const now = Date.now();
      const adapter = adapterFor(location.href);
      if (
        document.hidden ||
        !adapter ||
        adapter.phase(document) !== MeetingPhase.InMeeting ||
        cue.expiresAt <= now ||
        seen.has(cue.id) ||
        (cue.automatic && now - lastAutomatic < 60_000)
      )
        return;
      seen.add(cue.id);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      if (cue.automatic) lastAutomatic = now;
      clear();
      const sourceUrl = adapter.meetingUrl(new URL(location.href));
      const candidate =
        cue.target === AttentionTarget.Element
          ? cue.elementId
            ? visualTarget(cue.elementId)
            : undefined
          : cue.target === AttentionTarget.Presentation
            ? presentationVideo(document)
            : cue.target === AttentionTarget.Captions
              ? document.querySelector<HTMLElement>(
                  '[jsname="dsyhDe"], [data-caption-container], button[aria-label*="Captions"], button[aria-label*="captions"]',
                )
              : coachButton;
      if (cue.target === AttentionTarget.Element && !candidate) {
        console.info("cue_attention_target_unavailable", { run_id: cue.id });
        return;
      }
      const target =
        candidate && candidate.getBoundingClientRect().width > 0
          ? candidate
          : coachButton;
      layer = document.createElement("div");
      layer.setAttribute("popover", "manual");
      layer.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;border:0;margin:0;padding:0;background:transparent;overflow:visible;pointer-events:none;";
      const root = layer.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `
        .anchor { position:absolute; pointer-events:none; }
        .note { position:absolute; max-width:min(320px,calc(100vw - 48px)); padding:12px 38px 12px 14px; border:1px solid #8c7048; border-radius:12px; background:#20201ff5; color:#eee; font:14px/1.5 system-ui; box-shadow:0 4px 20px #0003; pointer-events:auto; animation:appear 180ms ease-out; }
        p { margin:0; overflow-wrap:anywhere; }
        button { position:absolute; top:6px; right:6px; width:28px; height:28px; border:0; border-radius:6px; background:transparent; color:#bbb; cursor:pointer; }
        button:hover { background:#ffffff12; }
        button:focus-visible { outline:2px solid #d2a25c; }
        @keyframes appear { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @media(prefers-reduced-motion:reduce) { .note { animation:none; } }
      `;
      const anchorBox = document.createElement("div");
      anchorBox.style.position = "absolute";
      const anchor = document.createElement("div");
      anchor.className = "anchor";
      anchorBox.append(anchor);
      const note = document.createElement("aside");
      note.className = "note";
      note.setAttribute("role", "status");
      const line = document.createElement("p");
      line.dir = "auto";
      line.textContent = cue.line;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Dismiss cue");
      close.onclick = dismiss;
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Open coach";
      open.style.cssText =
        "position:static;width:auto;height:auto;margin-top:8px;padding:2px 0;color:#d2a25c;font:inherit;";
      open.onclick = () => {
        coachButton.click();
        clear();
      };
      note.append(line, close, open);
      root.append(style, anchorBox, note);
      document.body.append(layer);
      layer.showPopover();
      const position = () => {
        if (
          !target.isConnected ||
          document.hidden ||
          adapter.meetingUrl(new URL(location.href)) !== sourceUrl ||
          adapter.phase(document) !== MeetingPhase.InMeeting
        ) {
          clear();
          return;
        }
        note.hidden = isExpanded();
        const trigger = coachButton.getBoundingClientRect();
        note.style.right = `${Math.max(12, innerWidth - trigger.right)}px`;
        note.style.bottom = `${Math.max(12, innerHeight - trigger.top + 12)}px`;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          clear();
          return;
        }
        anchorBox.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
        anchor.style.cssText = `left:0;top:0;width:${rect.width}px;height:${rect.height}px;`;
      };
      position();
      if (!layer) return;
      try {
        drawing = annotate(anchor, {
          type: target === coachButton ? "circle" : "box",
          color: "#d2a25c",
          strokeWidth: 2,
          padding: 5,
          duration: 350,
          iterations: 1,
        }).show();
      } catch {
        // A drawing failure must leave the readable cue usable.
        drawing?.remove();
        drawing = undefined;
        console.warn("cue_attention_drawing_unavailable", { run_id: cue.id });
      }
      timer = setInterval(position, 250);
      expiry = setTimeout(clear, Math.min(12_000, cue.expiresAt - now));
      console.info("cue_attention_shown", {
        run_id: cue.id,
        target: cue.target,
        automatic: cue.automatic,
      });
    },
    dispose() {
      clear();
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hidden);
    },
  };
}
