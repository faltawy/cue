import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  type CoachSettings,
  commands as coachCommands,
} from "@anlg/plugin-coach";

import { createCoachModel } from "../claude-code-model";

import {
  LLMConnectionState,
  ManagedProviderUnavailableReason,
  ManagedProviderId,
} from "~/ai/enums";
import { useSettingsReady } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

export const COACH_SETTINGS_QUERY_KEY = ["coach", "settings"] as const;

export type LLMConnectionStatus =
  | {
      status: LLMConnectionState.Pending;
      reason: ManagedProviderUnavailableReason;
    }
  | {
      status: LLMConnectionState.Error;
      reason: "settings_unavailable";
      message: string;
    }
  | { status: LLMConnectionState.Success; providerId: ManagedProviderId };

type LLMConnectionResult = {
  conn: { providerId: ManagedProviderId; modelId: string } | null;
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
  const provider = coachSettings.data?.provider ?? "claude";
  const providerId =
    provider === "codex"
      ? ManagedProviderId.Codex
      : ManagedProviderId.ClaudeCode;
  const modelId =
    provider === "codex"
      ? coachSettings.data?.codex_model
      : coachSettings.data?.model;
  const error = coachSettings.error;

  return useMemo<LLMConnectionResult>(() => {
    if (settingsReady && intelligence_disabled) {
      return {
        conn: null,
        status: {
          status: LLMConnectionState.Pending,
          reason: ManagedProviderUnavailableReason.ManagedDisabled,
        },
      };
    }
    if (error) {
      return {
        conn: null,
        status: {
          status: LLMConnectionState.Error,
          reason: "settings_unavailable",
          message: error.message,
        },
      };
    }
    if (!settingsReady || modelId === undefined) {
      return {
        conn: null,
        status: {
          status: LLMConnectionState.Pending,
          reason: ManagedProviderUnavailableReason.SettingsLoading,
        },
      };
    }
    return {
      conn: { providerId, modelId },
      status: { status: LLMConnectionState.Success, providerId },
    };
  }, [settingsReady, intelligence_disabled, modelId, providerId, error]);
};

export const useLLMConnectionStatus = (): LLMConnectionStatus =>
  useLLMConnection().status;

export const useLanguageModel = () => {
  const { conn } = useLLMConnection();
  const modelId = conn?.modelId;
  const provider =
    conn?.providerId === ManagedProviderId.Codex ? "codex" : "claude";
  return useMemo(
    () => (modelId !== undefined ? createCoachModel(provider, modelId) : null),
    [modelId, provider],
  );
};
