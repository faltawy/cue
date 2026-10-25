import { describe, expect, it } from "vitest";

import {
  normalizeAppIconPreference,
  resolveAppIconName,
  resolveDockIconName,
} from "./icon";

import { AppIconPreference, ThemePreference } from "~/shared/enums";

describe("app icon preference", () => {
  it("falls back to the default icon for unknown values", () => {
    expect(normalizeAppIconPreference(undefined)).toBe("default");
    expect(normalizeAppIconPreference("unknown")).toBe("default");
    expect(normalizeAppIconPreference("stable")).toBe("stable");
    expect(normalizeAppIconPreference("dev")).toBe("dev");
    expect(normalizeAppIconPreference("staging")).toBe("staging");
  });

  it.each([
    "anagram",
    "journal",
    "notepad",
    "stone",
    "typewriter-key",
    "walnut",
  ])("moves the retired %s icon back to the default", (retired) => {
    expect(normalizeAppIconPreference(retired)).toBe("default");
  });

  it("resolves the default icon from the app channel", () => {
    expect(
      resolveAppIconName(AppIconPreference.Default, "com.hyprnote.stable"),
    ).toBe("stable");
    expect(
      resolveAppIconName(AppIconPreference.Default, "com.hyprnote.nightly"),
    ).toBe("staging");
    expect(
      resolveAppIconName(AppIconPreference.Default, "com.hyprnote.staging"),
    ).toBe("staging");
    expect(
      resolveAppIconName(AppIconPreference.Default, "com.hyprnote.dev"),
    ).toBe("dev");
  });

  it("follows the system appearance for the system theme", () => {
    expect(
      resolveDockIconName(
        AppIconPreference.Dev,
        ThemePreference.System,
        false,
        "com.hyprnote.stable",
      ),
    ).toBe("dev");
    expect(
      resolveDockIconName(
        AppIconPreference.Dev,
        ThemePreference.System,
        true,
        "com.hyprnote.stable",
      ),
    ).toBe("dev-dark");
    expect(
      resolveDockIconName(
        AppIconPreference.Staging,
        ThemePreference.System,
        true,
        "com.hyprnote.stable",
      ),
    ).toBe("staging-dark");
  });

  it("overrides the system appearance with an explicit theme", () => {
    expect(
      resolveDockIconName(
        AppIconPreference.Dev,
        ThemePreference.Dark,
        false,
        "com.hyprnote.stable",
      ),
    ).toBe("dev-dark");
    expect(
      resolveDockIconName(
        AppIconPreference.Dev,
        ThemePreference.Light,
        true,
        "com.hyprnote.stable",
      ),
    ).toBe("dev");
    expect(
      resolveDockIconName(
        AppIconPreference.Default,
        ThemePreference.Dark,
        false,
        "com.hyprnote.stable",
      ),
    ).toBe("stable-dark");
  });
});
