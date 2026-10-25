import { useQuery } from "@tanstack/react-query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import {
  AIProviderType,
  usesDeferredProviderAuthentication,
} from "@anlg/provider-validation";
import { Spinner } from "@anlg/ui/components/ui/spinner";

import { SttHealthStatus } from "~/settings/enums";
import { useConfigValues } from "~/shared/config";
import { isLocalFileSttModel, isOnDeviceSttModel } from "~/stt/capabilities";
import { SttConnectionStatus } from "~/stt/enums";
import { useSTTConnection } from "~/stt/useSTTConnection";

export type HealthStatus = {
  status: SttHealthStatus | null;
  message?: string;
};

export function HealthStatusIndicator() {
  const health = useConnectionHealth();

  if (health.status === SttHealthStatus.Pending) {
    return <Spinner size={14} className="text-muted-foreground shrink-0" />;
  }

  return null;
}

function useDeepgramHealth(enabled: boolean, apiKey?: string) {
  return useQuery({
    enabled,
    queryKey: ["stt-health-check", "deepgram", apiKey],
    staleTime: 0,
    retry: 3,
    retryDelay: 200,
    queryFn: async () => {
      const response = await tauriFetch(
        "https://api.deepgram.com/v1/projects",
        {
          headers: {
            Authorization: `Token ${apiKey}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.status;
    },
  });
}

export function useConnectionHealth(): HealthStatus {
  const { conn, local } = useSTTConnection();
  const { current_stt_provider, current_stt_model } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
  ] as const);

  const isLocalModel =
    isOnDeviceSttModel(current_stt_provider, current_stt_model) ||
    isLocalFileSttModel(current_stt_provider, current_stt_model);
  const isManagedProvider = ["soniqo", "apple_speech", "local_file"].includes(
    current_stt_provider ?? "",
  );
  const isDeepgram = current_stt_provider === "deepgram";

  const deepgramHealth = useDeepgramHealth(isDeepgram && !!conn, conn?.apiKey);

  if (isManagedProvider && current_stt_model && !isLocalModel) {
    return {
      status: SttHealthStatus.Error,
      message: "Selected model is no longer available.",
    };
  }

  if (isLocalModel) {
    const serverStatus = local.data?.status ?? SttConnectionStatus.Unavailable;
    if (serverStatus === SttConnectionStatus.NotDownloaded) {
      return {
        status: SttHealthStatus.Error,
        message: "Selected model is not downloaded.",
      };
    }
    if (serverStatus === SttConnectionStatus.NotSelected) {
      return {
        status: SttHealthStatus.Error,
        message: "Choose a local transcription model file.",
      };
    }
    if (serverStatus === SttConnectionStatus.Error) {
      return {
        status: SttHealthStatus.Error,
        message:
          local.data && "error" in local.data
            ? local.data.error
            : "Could not load the local speech-to-text model.",
      };
    }
    if (serverStatus === SttConnectionStatus.Loading) {
      return {
        status: SttHealthStatus.Pending,
        message: "Local STT server is starting up…",
      };
    }
    if (serverStatus === SttConnectionStatus.Ready && conn) {
      return { status: SttHealthStatus.Success };
    }
    return {
      status: SttHealthStatus.Error,
      message: "Could not connect to the local speech-to-text model.",
    };
  }

  if (!conn) {
    return {
      status: SttHealthStatus.Error,
      message: "Provider not configured.",
    };
  }

  if (isDeepgram) {
    if (deepgramHealth.isPending) {
      return {
        status: SttHealthStatus.Pending,
        message: "Verifying API key...",
      };
    }
    if (deepgramHealth.isError) {
      return {
        status: SttHealthStatus.Error,
        message: `API key verification failed: ${deepgramHealth.error.message}`,
      };
    }
    if (deepgramHealth.isSuccess) {
      return { status: SttHealthStatus.Success };
    }
  }

  if (
    usesDeferredProviderAuthentication(
      AIProviderType.Stt,
      current_stt_provider ?? "",
    )
  ) {
    return {
      status: null,
      message: "Credentials will be checked when transcription starts.",
    };
  }
  return { status: SttHealthStatus.Success };
}
