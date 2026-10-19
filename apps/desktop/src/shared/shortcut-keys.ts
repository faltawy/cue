export type ShortcutKey =
  | "mod"
  | "ctrl"
  | "alt"
  | "shift"
  | "enter"
  | "esc"
  | string;

const LABELS: Record<string, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  mod: "⌘",
  enter: "⏎",
  esc: "Esc",
};

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "mod"];

function rank(key: ShortcutKey) {
  const index = MODIFIER_ORDER.indexOf(key);
  return index === -1 ? MODIFIER_ORDER.length : index;
}

/** macOS order (⌃⌥⇧⌘, then the key), as in the coach's `Kbd`. */
export function shortcutLabels(keys: readonly ShortcutKey[]): string[] {
  return [...keys]
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => LABELS[key] ?? key.toUpperCase());
}
