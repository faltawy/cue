---
version: 1
slug: "apps-extension-src-panel-html"
primary_target: "apps/extension/src/panel.html"
related_targets: ["apps/extension/src/embedded-panel.ts","packages/assistant/src/ui/app.tsx"]
---

# Meet coach panel

Mode: Operate. The in-call coach inside Google Meet (extension panel + embedded shared coach UI).

Audience and job: someone in a live customer call glancing at a private coach for about a second, or asking it something on demand. Proactive cues and chat carry equal weight.

Constraints: never cover faces or Meet controls; minimizable; private; Arabic/RTL; debug drawer stays reachable; the shared coach UI stays one product with the desktop coach; visual system is docs/design/cue.md.

## Direction contract

THESIS: One feed with slash-command tools that docks above Meet's controls or as a right sidebar; collapsed, it is a single cue line. Refuses the floating card + separate connection shell + chat stack.

OWN-WORLD: Cue's dark tokens (background, foreground, muted, border), amber only on cue edges, status dot and focus, red only for the live dot. Inter at the spec's type roles; hairline borders, 8/12px radii, no shadows except the floating sheet.

STORY: The person sees the current move in one line, opens the panel to ask or catch up, types / for meeting tools, and moves the panel between bottom and side without losing their place.

FIRST VIEWPORT: Side dock: h-11 header (meeting title, Only you, status dot, Bottom/Side segmented switch, overflow with debug, collapse). Feed of cues (amber start edge) and answers, newest at the bottom. Composer with / menu. Cue strip pinned at the foot: live dot, tabular timer, current cue, truncating.

FORM: Strip + command feed, dockable (user mix of dealt structures 2 and 3, plus sidebar dock). seed:0943666a17c580ad

MOTION: Dock switch is one shared-element move (FLIP spring, visualDuration .35, bounce .15) preserving feed scroll and composer; collapse/expand grows from and folds into the strip; reduced motion becomes a 150ms opacity fade.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
