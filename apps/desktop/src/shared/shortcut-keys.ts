export type ShortcutKey = "mod" | "shift" | "alt" | "enter" | "esc" | string;

const LABELS: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  enter: "↵",
  esc: "esc",
};

export function shortcutLabels(keys: readonly ShortcutKey[]): string[] {
  return keys.map((key) => LABELS[key] ?? key.toUpperCase());
}
