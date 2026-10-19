import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The coach ships its own copy of the palette (it follows the OS appearance
// instead of a `.dark` class); the app's lives in the design system. They must
// not drift: docs/design/cue.md derives one from the other.
const coachCss = readFileSync(join(import.meta.dir, "styles.css"), "utf8");
const appCss = readFileSync(join(import.meta.dir, "../../../../packages/design-system/src/tokens.css"), "utf8");

function block(css: string, opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`missing ${opener}`);
  const body = css.slice(start + opener.length, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const coach = {
  light: block(coachCss, ":root {"),
  dark: block(coachCss.slice(coachCss.indexOf("@media (prefers-color-scheme: dark)")), ":root {"),
};
const app = { light: block(appCss, ":root {"), dark: block(appCss, ".dark {") };

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
