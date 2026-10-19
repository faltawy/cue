// Class-level rules from docs/design/cue.md, shared by the `anlg/cue-design`
// oxlint rule and its tests. Each finding is { category, token }.

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const COLOR_UTILITIES =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|decoration|caret|accent|placeholder|shadow|from|via|to";

const RAW_COLOR = new RegExp(
  `^(?:${COLOR_UTILITIES})-(?:(?:${PALETTE})-\\d{2,3}|white|black|\\[(?:#|rgb|hsl|oklch|color)[^\\]]*\\])(?:/.+)?$`,
);
// `text-sm`/`text-xs` are out too: body and label are the one 14px and 12px
// styles (cue.md §2), so there is a single line height per size.
const TEXT_SIZE =
  /^text-(?:\[\d*\.?\d+(?:px|rem|em)\]|xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
// Physical sides (cue.md §2 RTL): padding, margin, inset, text alignment and
// borders use the logical start/end forms. `left-1/2` stays: centring with
// `-translate-x-1/2` is direction-neutral.
const DIRECTION =
  /^(?:(?:p|m|scroll-p|scroll-m)[lr]-.+|(?:left|right)-.+|text-(?:left|right)|border-[lr](?:-.+)?)$/;
const CENTRED = new Set(["left-1/2", "right-1/2"]);
const SHADOW = /^(?:shadow|drop-shadow)(?:-.+)?$/;
const BLUR = /^(?:backdrop-blur|backdrop-saturate|blur)(?:-.+)?$/;
const GRADIENT =
  /^(?:bg-(?:linear|gradient|radial|conic)-.+|(?:from|via|to)-.+)$/;
const RADIUS = /^rounded(?:-(?<side>[a-z]{1,2}))?(?:-(?<size>[^\s]+))?$/;

const RADIUS_STEPS = new Set(["sm", "md", "lg", "xl", "full", "none"]);
const LOGICAL_OR_BLOCK_SIDES = new Set([
  "s",
  "e",
  "ss",
  "se",
  "es",
  "ee",
  "t",
  "b",
]);
const PHYSICAL_SIDES = new Set(["l", "r", "tl", "tr", "bl", "br"]);

// The floating layers: the only places shadows belong (cue.md §3).
const SHADOW_FILES = [
  "packages/ui/src/components/ui/floating-content.tsx",
  "packages/ui/src/components/ui/tooltip.tsx",
  "packages/ui/src/components/ui/dialog.tsx",
  "packages/ui/src/components/ui/app-toast.tsx",
];
const FLOATING_SHADOWS = new Set(["shadow-md", "shadow-lg", "shadow-2xl"]);

// Documented exceptions (cue.md §2–§4): file suffix -> allowed tokens.
const ALLOWED = {
  // Switch thumb: the one white fill and the one small shadow.
  "packages/ui/src/components/ui/switch.tsx": ["bg-white", "shadow-sm"],
  // Kbd keeps the coach's 10.5px.
  "packages/ui/src/components/ui/kbd.tsx": ["text-[10.5px]"],
  // App icon preview mirrors the macOS icon mask (22.5% of the tile).
  "apps/desktop/src/settings/appearance/app-icon.tsx": ["rounded-[18px]"],
  // Streaming summary heading matches the editor H1 (editor prose scale).
  "apps/desktop/src/session/components/note-input/enhanced/streaming.tsx": [
    "text-[1.5rem]",
  ],
  // macOS traffic lights in the theme preview.
  "apps/desktop/src/settings/appearance/theme.tsx": [
    "bg-[#ff5f57]",
    "bg-[#febc2e]",
    "bg-[#28c840]",
  ],
  // White camera glyph on the bg-scrim photo overlay.
  "apps/desktop/src/contacts/contact-avatar.tsx": ["text-white"],
  // Emoji glyph size (not text) and the check on a colour swatch.
  "apps/desktop/src/templates/template-icon-picker.tsx": [
    "text-lg",
    "text-white",
  ],
  // Window chrome beside the macOS traffic lights: the lights stay on the
  // physical left whatever the UI language, so these offsets do too.
  "apps/desktop/src/main/body.tsx": ["left-0", "left-1"],
  "apps/desktop/src/changelog/index.tsx": [
    "pl-[80px]",
    "left-0",
    "left-[28px]",
    "right-[70px]",
  ],
  // The macOS traffic lights stay on the physical left whatever the UI
  // language, so their gutter is physical too.
  "apps/desktop/src/shared/hooks/useWindowControlsGutter.ts": [
    "pl-[calc(76px_/_var(--anlg-zoom,1))]",
    "left-[calc(76px_/_var(--anlg-zoom,1)_+_28px)]",
    "pl-[calc(76px_/_var(--anlg-zoom,1)_+_32px)]",
    "pl-[calc(76px_/_var(--anlg-zoom,1)_+_80px)]",
  ],
};

/** Strips variants (`hover:`, `dark:`, `[&>svg]:`) and `!` from a class. */
export function baseClass(token) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "").replace(/^-/, "");
}

function radiusFinding(base) {
  const match = RADIUS.exec(base);
  if (!match) return false;
  let { side, size } = match.groups;
  if (side && !LOGICAL_OR_BLOCK_SIDES.has(side) && !PHYSICAL_SIDES.has(side)) {
    // `rounded-sm` parses as side "sm"; re-read it as a size.
    size = size ? `${side}-${size}` : side;
    side = undefined;
  }
  if (side && PHYSICAL_SIDES.has(side)) return true;
  if (size === undefined) return true; // bare `rounded`
  // `inherit` follows the parent's radius, which is itself on the scale.
  return !RADIUS_STEPS.has(size) && size !== "[inherit]";
}

function category(base, file) {
  if (RAW_COLOR.test(base)) return "palette";
  if (TEXT_SIZE.test(base)) return "text-size";
  if (BLUR.test(base) && base !== "backdrop-blur-none" && base !== "blur-none")
    return "blur";
  if (GRADIENT.test(base)) return "gradient";
  if (SHADOW.test(base) && base !== "shadow-none") {
    const floating = SHADOW_FILES.some((f) => file.endsWith(f));
    return floating && FLOATING_SHADOWS.has(base) ? null : "shadow";
  }
  if (base.startsWith("rounded") && radiusFinding(base)) return "radius";
  if (DIRECTION.test(base) && !CENTRED.has(base)) return "direction";
  return null;
}

/** Findings for one class string in `file` (a repo-relative or absolute path). */
export function findViolations(classString, file = "") {
  const allowed = Object.entries(ALLOWED).find(([suffix]) =>
    file.endsWith(suffix),
  )?.[1];
  const findings = [];
  for (const token of classString.split(/\s+/)) {
    if (!token || allowed?.includes(token)) continue;
    // Focus is the one global outline (cue.md §6), never a per-element ring.
    if (
      /(?:^|:)focus(?:-visible)?:/.test(token) &&
      /^ring/.test(baseClass(token))
    ) {
      findings.push({ category: "focus", token });
      continue;
    }
    const found = category(baseClass(token), file);
    if (found) findings.push({ category: found, token });
  }
  return findings;
}
