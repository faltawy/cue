import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The coach ships its own copy of the palette (`light-dark()` pairs that follow the
// host's `color-scheme` instead of a `.dark` class); the app's lives in the design system. They must
// not drift: docs/design/cue.md derives one from the other.
const coachCss = readFileSync(
  join(import.meta.dir, "../../../../packages/assistant/src/theme.css"),
  "utf8",
);
const appCss = readFileSync(
  join(import.meta.dir, "../../../../packages/design-system/src/tokens.css"),
  "utf8",
);

// The first innermost rule whose selector list includes `selector` (`:root`, `:root, .light`, …).
function block(css: string, selector: string): Record<string, string> {
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, prelude = "", body = ""] of uncommented.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    const selectors = prelude.split(";").at(-1) ?? "";
    if (!selectors.split(",").some((part) => part.trim() === selector))
      continue;
    return Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(
        ([, name, value = ""]) => [name, value.trim()],
      ),
    );
  }
  throw new Error(`missing a rule for ${selector}`);
}

// `light-dark(light, dark)` → the value for one scheme; plain values apply to both.
function scheme(value: string, theme: "light" | "dark"): string {
  const inner = /^light-dark\((.*)\)$/s.exec(value)?.[1]?.trim();
  if (!inner) return value;
  let depth = 0;
  for (const [index, char] of [...inner].entries()) {
    depth += char === "(" ? 1 : char === ")" ? -1 : 0;
    if (char === "," && depth === 0)
      return (
        theme === "light" ? inner.slice(0, index) : inner.slice(index + 1)
      ).trim();
  }
  throw new Error(`malformed light-dark(): ${value}`);
}
const coachTokens = block(coachCss, ":root");
const coach = Object.fromEntries(
  (["light", "dark"] as const).map((theme) => [
    theme,
    Object.fromEntries(
      Object.entries(coachTokens).map(([name, value]) => [
        name,
        scheme(value, theme),
      ]),
    ),
  ]),
) as Record<"light" | "dark", Record<string, string>>;
const app = { light: block(appCss, ":root"), dark: block(appCss, ".dark") };

// coach name -> app name
const SHARED: Record<string, string> = {
  surface: "background",
  foreground: "foreground",
  primary: "primary",
  "primary-foreground": "primary-foreground",
  muted: "muted",
  "muted-foreground": "muted-foreground",
  border: "border",
  destructive: "destructive",
  success: "success",
  warm: "warm",
  "warm-strong": "warm-strong",
  "warm-glow": "warm-glow",
  live: "live",
};

describe("coach and app tokens", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} values match`, () => {
      const pairs = Object.entries(SHARED).map(([coachName, appName]) => [
        coachName,
        coach[theme][coachName],
        app[theme][appName],
      ]);
      for (const [name, coachValue, appValue] of pairs) {
        expect(coachValue, `coach --${name}`).toBeDefined();
        expect(coachValue, `coach --${name}`).toBe(appValue);
      }
    });
  }
});
