import type { SectionStatus } from "./shared";

export type OnboardingStep = "permissions" | "calendar" | "final";

const STEPS: OnboardingStep[] = ["permissions", "calendar", "final"];

export function getInitialStep(): OnboardingStep {
  return STEPS[0];
}

export function getNextStep(
  currentStep: OnboardingStep,
): OnboardingStep | null {
  const idx = STEPS.indexOf(currentStep);
  return idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
}

export function getPrevStep(
  currentStep: OnboardingStep,
): OnboardingStep | null {
  const idx = STEPS.indexOf(currentStep);
  return idx > 0 ? STEPS[idx - 1] : null;
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
