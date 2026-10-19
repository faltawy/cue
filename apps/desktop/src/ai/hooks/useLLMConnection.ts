import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  type ClaudeModel,
  type CoachSettings,
  commands as coachCommands,
} from "@anlg/plugin-coach";

import { createClaudeCodeModel } from "../claude-code-model";

import { useSettingsReady } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

export const COACH_SETTINGS_QUERY_KEY = ["coach", "settings"] as const;

export type LLMConnectionStatus =
  | { status: "pending"; reason: "managed_disabled" | "settings_loading" }
  | { status: "error"; reason: "settings_unavailable"; message: string }
  | { status: "success"; providerId: "claude_code" };

type LLMConnectionResult = {
  conn: { providerId: "claude_code"; modelId: ClaudeModel } | null;
  status: LLMConnectionStatus;
};

export async function fetchCoachSettings(): Promise<CoachSettings> {
  const result = await coachCommands.getSettings();
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export function useCoachSettings() {
  return useQuery({
    queryKey: COACH_SETTINGS_QUERY_KEY,
    queryFn: fetchCoachSettings,
    staleTime: Infinity,
  });
}

export const useLLMConnection = (): LLMConnectionResult => {
  const settingsReady = useSettingsReady();
  const { intelligence_disabled } = useConfigValues([
    "intelligence_disabled",
  ] as const);
  const coachSettings = useCoachSettings();
  const modelId = coachSettings.data?.model;
  const error = coachSettings.error;

  return useMemo<LLMConnectionResult>(() => {
    if (settingsReady && intelligence_disabled) {
      return {
        conn: null,
        status: { status: "pending", reason: "managed_disabled" },
      };
    }
    if (error) {
      return {
        conn: null,
        status: {
          status: "error",
          reason: "settings_unavailable",
          message: error.message,
        },
      };
    }
    if (!settingsReady || !modelId) {
      return {
        conn: null,
        status: { status: "pending", reason: "settings_loading" },
      };
    }
    return {
      conn: { providerId: "claude_code", modelId },
      status: { status: "success", providerId: "claude_code" },
    };
  }, [settingsReady, intelligence_disabled, modelId, error]);
};

export const useLLMConnectionStatus = (): LLMConnectionStatus =>
  useLLMConnection().status;

export const useLanguageModel = () => {
  const { conn } = useLLMConnection();
  const modelId = conn?.modelId;
  return useMemo(
    () => (modelId ? createClaudeCodeModel(modelId) : null),
    [modelId],
  );
};
