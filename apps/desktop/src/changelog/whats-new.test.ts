import { describe, expect, it } from "vitest";

import { shouldAnnounceUpdate } from "./whats-new";

describe("shouldAnnounceUpdate", () => {
  it.each([
    { lastSeen: "0.1.3", current: "0.1.4", hasNotes: true, expected: true },
    { lastSeen: null, current: "0.1.4", hasNotes: true, expected: false },
    { lastSeen: "0.1.4", current: "0.1.4", hasNotes: true, expected: false },
    { lastSeen: "0.1.3", current: "0.1.4", hasNotes: false, expected: false },
  ])(
    "opens once after updating from $lastSeen to $current (notes: $hasNotes)",
    ({ lastSeen, current, hasNotes, expected }) => {
      expect(shouldAnnounceUpdate(lastSeen, current, hasNotes)).toBe(expected);
    },
  );
});
