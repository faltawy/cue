import { describe, expect, it } from "vitest";

import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it.each([
    [1, "en", "1 byte"],
    [512, "en", "512 bytes"],
    [1536, "en", "1.5 kB"],
    [734_003_200, "en", "700 MB"],
    [1_394_811_928_576, "en", "1.3 TB"],
    [1_394_811_928_576, "de", "1,3 TB"],
  ])("formats %d bytes in %s as %s", (bytes, locale, expected) => {
    expect(formatBytes(bytes, locale)).toBe(expected);
  });
});
