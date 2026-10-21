import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ClaudeSetup,
  commands as coachCommands,
} from "@anlg/plugin-coach";

export const CLAUDE_SETUP_QUERY_KEY = ["claude-setup"] as const;
const PREPARING_POLL_MS = 1_000;

async function claudeSetup() {
  const result = await coachCommands.claudeSetup();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

async function retryClaudeSetup() {
  const result = await coachCommands.retryClaudeSetup();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

/**
 * Getting Claude ready, started at app launch: the person's own Claude Code
 * when it is new enough, else Cue's copy downloading in the background.
 */
export function useClaudeSetup(provider: "claude" | "codex" = "claude"): {
  setup: ClaudeSetup | undefined;
  error: Error | null;
  ready: boolean;
  retry: () => void;
  retrying: boolean;
} {
  const queryClient = useQueryClient();
  const queryKey =
    provider === "claude" ? CLAUDE_SETUP_QUERY_KEY : ["codex-setup"];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (provider === "claude") return claudeSetup();
      const result = await coachCommands.providerSetup(provider);
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    refetchInterval: (current) =>
      current.state.data?.state === "preparing" ? PREPARING_POLL_MS : false,
  });
  const retry = useMutation({
    mutationFn: async () => {
      if (provider === "claude") return retryClaudeSetup();
      const result = await coachCommands.retryProviderSetup(provider);
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    onSuccess: (next) => queryClient.setQueryData(queryKey, next),
  });
  return {
    setup: query.data,
    error: query.error ?? retry.error,
    ready: query.data?.state === "ready",
    retry: () => retry.mutate(),
    retrying: retry.isPending,
  };
}
