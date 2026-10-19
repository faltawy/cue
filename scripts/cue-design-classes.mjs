// Class-level rules from docs/design/cue.md, shared by the `anlg/cue-design`
// oxlint rule and its tests. Each finding is { category, token }.

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const COLOR_UTILITIES =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|decoration|caret|accent|placeholder|shadow|from|via|to";

const RAW_COLOR = new RegExp(
  `^(?:${COLOR_UTILITIES})-(?:(?:${PALETTE})-\\d{2,3}|white|black|\\[(?:#|rgb|hsl|oklch|color)[^\\]]*\\])(?:/.+)?$`,
);
const TEXT_SIZE =
  /^text-(?:\[\d*\.?\d+(?:px|rem|em)\]|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
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
  "packages/ui/src/components/ui/switch.tsx": ["bg-white", "shadow-sm"],
  "packages/ui/src/components/ui/kbd.tsx": ["text-[10.5px]"],
  "apps/desktop/src/main/windows-window-controls.tsx": [
    "hover:text-white",
    "hover:bg-[#c42b1c]",
  ],
  "apps/desktop/src/settings/appearance/app-icon.tsx": ["rounded-[18px]"],
  "apps/desktop/src/session/components/note-input/enhanced/streaming.tsx": [
    "text-[1.5rem]",
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
  return !RADIUS_STEPS.has(size);
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
    const found = category(baseClass(token), file);
    if (found) findings.push({ category: found, token });
  }
  return findings;
}
