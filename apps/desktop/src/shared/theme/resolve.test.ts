import { describe, expect, it } from "vitest";

import { resolveIsDarkMode } from "./resolve";

import { ThemePreference } from "~/shared/enums";

describe("resolveIsDarkMode", () => {
  it.each([
    [ThemePreference.Dark, false, true],
    [ThemePreference.Light, true, false],
    [ThemePreference.System, true, true],
    [ThemePreference.System, false, false],
  ] as const)(
    "resolves %s theme with system appearance %s to %s",
    (theme, prefersDark, expected) => {
      expect(resolveIsDarkMode(theme, prefersDark)).toBe(expected);
    },
  );
});
