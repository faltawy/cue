export enum OnboardingStep {
  Permissions = "permissions",
  Calendar = "calendar",
  Claude = "claude",
  Final = "final",
}

export enum SectionStatus {
  Completed = "completed",
  Active = "active",
  Upcoming = "upcoming",
}

export enum OnboardingCompletionStatus {
  Idle = "idle",
  Loading = "loading",
  Error = "error",
}

export enum OnboardingButtonVariant {
  Primary = "primary",
  Secondary = "secondary",
  Ghost = "ghost",
}

export enum SetupStepStatus {
  Done = "done",
  Active = "active",
  Failed = "failed",
}
