import { OnboardingStep, SectionStatus } from "~/onboarding/enums";

export { OnboardingStep };

const STEPS: OnboardingStep[] = [
  OnboardingStep.Permissions,
  OnboardingStep.Calendar,
  OnboardingStep.Claude,
  OnboardingStep.Final,
];

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
  if (stepIdx < currentIdx) return SectionStatus.Completed;
  if (stepIdx === currentIdx) return SectionStatus.Active;
  return SectionStatus.Upcoming;
}
