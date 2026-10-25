export enum BuildChannel {
  Dev = "dev",
  Staging = "staging",
  Nightly = "nightly",
  Stable = "stable",
}

export enum Tone {
  Ok = "ok",
  Warn = "warn",
  Bad = "bad",
}

export enum PromptMode {
  Fix = "fix",
  Explanation = "explanation",
  Data = "data",
}

export enum Edge {
  N = "n",
  S = "s",
  E = "e",
  W = "w",
  Ne = "ne",
  Nw = "nw",
  Se = "se",
  Sw = "sw",
}

export enum View {
  Ranked = "ranked",
  Overview = "overview",
  Prompts = "prompts",
  Settings = "settings",
}

export enum RecurringContentKind {
  Note = "note",
  Summary = "summary",
}

export enum ScanEventKind {
  Interaction = "interaction",
  DroppedFrames = "dropped-frames",
}

export enum ScanSeverity {
  Low = "low",
  NeedsImprovement = "needs-improvement",
  High = "high",
}
