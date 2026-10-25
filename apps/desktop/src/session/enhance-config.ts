import { LLMConnectionState } from "~/ai/enums";
import type { LLMConnectionStatus } from "~/ai/hooks";

export function shouldShowEmptySummaryConfigError(status: LLMConnectionStatus) {
  return status.status === LLMConnectionState.Error;
}
