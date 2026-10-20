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
export function useClaudeSetup(): {
  setup: ClaudeSetup | undefined;
  error: Error | null;
  ready: boolean;
  retry: () => void;
  retrying: boolean;
} {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CLAUDE_SETUP_QUERY_KEY,
    queryFn: claudeSetup,
    refetchInterval: (current) =>
      current.state.data?.state === "preparing" ? PREPARING_POLL_MS : false,
  });
  const retry = useMutation({
    mutationFn: retryClaudeSetup,
    onSuccess: (next) => queryClient.setQueryData(CLAUDE_SETUP_QUERY_KEY, next),
  });
  return {
    setup: query.data,
    error: query.error ?? retry.error,
    ready: query.data?.state === "ready",
    retry: () => retry.mutate(),
    retrying: retry.isPending,
  };
}
