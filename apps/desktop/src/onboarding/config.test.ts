import { describe, expect, it } from "vitest";

import { getNextStep, getPrevStep } from "./config";

import { OnboardingStep } from "~/onboarding/enums";

describe("onboarding steps", () => {
  it("asks for the Claude sign-in only when Claude isn't signed in yet", () => {
    expect(getNextStep(OnboardingStep.Calendar)).toBe("claude");
    expect(getNextStep(OnboardingStep.Calendar, [OnboardingStep.Claude])).toBe(
      "final",
    );
    expect(getPrevStep(OnboardingStep.Final, [OnboardingStep.Claude])).toBe(
      "calendar",
    );
  });
});
