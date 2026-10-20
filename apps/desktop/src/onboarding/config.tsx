import type { SectionStatus } from "./shared";

export type OnboardingStep = "permissions" | "calendar" | "claude" | "final";

const STEPS: OnboardingStep[] = ["permissions", "calendar", "claude", "final"];

export function getInitialStep(): OnboardingStep {
  return STEPS[0];
}

export function getNextStep(
  currentStep: OnboardingStep,
  skipped: readonly OnboardingStep[] = [],
): OnboardingStep | null {
  return (
    STEPS.slice(STEPS.indexOf(currentStep) + 1).find(
      (step) => !skipped.includes(step),
    ) ?? null
  );
}

export function getPrevStep(
  currentStep: OnboardingStep,
  skipped: readonly OnboardingStep[] = [],
): OnboardingStep | null {
  return (
    STEPS.slice(0, STEPS.indexOf(currentStep))
      .reverse()
      .find((step) => !skipped.includes(step)) ?? null
  );
}

export function getStepStatus(
  step: OnboardingStep,
  currentStep: OnboardingStep,
): SectionStatus | null {
  const stepIdx = STEPS.indexOf(step);
  if (stepIdx === -1) return null;
  const currentIdx = STEPS.indexOf(currentStep);
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "active";
  return "upcoming";
}
