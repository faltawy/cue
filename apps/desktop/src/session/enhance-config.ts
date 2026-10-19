import type { LLMConnectionStatus } from "~/ai/hooks";

export function shouldShowEmptySummaryConfigError(status: LLMConnectionStatus) {
  return status.status === "error";
}
