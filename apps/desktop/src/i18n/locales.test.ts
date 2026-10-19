import { describe, expect, test } from "vitest";

import { localeDirection, resolveDisplayLocale } from "./locales";

describe("resolveDisplayLocale", () => {
  test("resolves the canonical Filipino locale to the Tagalog catalog", () => {
    expect(resolveDisplayLocale("fil-PH")).toBe("tl");
  });

  test("uses base language for regional variants", () => {
    expect(resolveDisplayLocale("pt-BR")).toBe("pt");
    expect(resolveDisplayLocale("zh-Hans")).toBe("zh");
  });

  test("falls back to English for unsupported or invalid values", () => {
    expect(resolveDisplayLocale("eo")).toBe("en");
    expect(resolveDisplayLocale("not a locale")).toBe("en");
  });
});

describe("localeDirection", () => {
  test("lays out right-to-left for right-to-left scripts", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("he")).toBe("rtl");
    expect(localeDirection("fa-IR")).toBe("rtl");
  });

  test("lays out left-to-right for everything else", () => {
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("tr")).toBe("ltr");
    expect(localeDirection("zh")).toBe("ltr");
  });
});
