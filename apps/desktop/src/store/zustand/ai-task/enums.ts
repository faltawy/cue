export enum TaskStatus {
  Idle = "idle",
  Generating = "generating",
  Success = "success",
  Error = "error",
}

export enum TaskType {
  Enhance = "enhance",
  Title = "title",
}

export enum TaskStepType {
  Generating = "generating",
  Reasoning = "reasoning",
}

export enum AIErrorSourceKind {
  Provider = "provider",
  Openrouter = "openrouter",
  Upstream = "upstream",
}
