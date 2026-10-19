import { describe, expect, it } from "vitest";

import {
  normalizeAppIconPreference,
  resolveAppIconName,
  resolveDockIconName,
} from "./icon";

describe("app icon preference", () => {
  it("falls back to the default icon for unknown values", () => {
    expect(normalizeAppIconPreference(undefined)).toBe("default");
    expect(normalizeAppIconPreference("unknown")).toBe("default");
    expect(normalizeAppIconPreference("stable")).toBe("stable");
    expect(normalizeAppIconPreference("dev")).toBe("dev");
    expect(normalizeAppIconPreference("staging")).toBe("staging");
  });

  it.each(["anagram", "journal", "notepad", "stone", "typewriter-key", "walnut"])(
    "moves the retired %s icon back to the default",
    (retired) => {
      expect(normalizeAppIconPreference(retired)).toBe("default");
    },
  );

  it("resolves the default icon from the app channel", () => {
    expect(resolveAppIconName("default", "com.hyprnote.stable")).toBe("stable");
    expect(resolveAppIconName("default", "com.hyprnote.nightly")).toBe(
      "staging",
    );
    expect(resolveAppIconName("default", "com.hyprnote.staging")).toBe(
      "staging",
    );
    expect(resolveAppIconName("default", "com.hyprnote.dev")).toBe("dev");
  });

  it("follows the system appearance for the system theme", () => {
    expect(
      resolveDockIconName("dev", "system", false, "com.hyprnote.stable"),
    ).toBe("dev");
    expect(
      resolveDockIconName("dev", "system", true, "com.hyprnote.stable"),
    ).toBe("dev-dark");
    expect(
      resolveDockIconName("staging", "system", true, "com.hyprnote.stable"),
    ).toBe("staging-dark");
  });

  it("overrides the system appearance with an explicit theme", () => {
    expect(
      resolveDockIconName("dev", "dark", false, "com.hyprnote.stable"),
    ).toBe("dev-dark");
    expect(
      resolveDockIconName("dev", "light", true, "com.hyprnote.stable"),
    ).toBe("dev");
    expect(
      resolveDockIconName("default", "dark", false, "com.hyprnote.stable"),
    ).toBe("stable-dark");
  });
});
