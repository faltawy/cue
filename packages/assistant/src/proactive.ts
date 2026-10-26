export enum ProactiveState {
  On = "on",
  Off = "off",
  Quiet = "quiet",
  Capped = "capped",
  Unpriced = "unpriced",
}

export type ProactiveView = {
  state: ProactiveState;
  nudgesUsd: number | null;
  capUsd: number;
  meetingUsd: number | null;
  meetingTokens: number;
  cachedTokens: number;
};
