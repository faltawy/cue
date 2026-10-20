import { describe, expect, it } from "vitest";

import { getNextStep, getPrevStep } from "./config";

describe("onboarding steps", () => {
  it("asks for the Claude sign-in only when Claude isn't signed in yet", () => {
    expect(getNextStep("calendar")).toBe("claude");
    expect(getNextStep("calendar", ["claude"])).toBe("final");
    expect(getPrevStep("final", ["claude"])).toBe("calendar");
  });
});
