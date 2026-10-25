import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CoachProvider,
  commands as coachCommands,
} from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";

import { ClaudeSetupLabel } from "~/ai/claude-setup-label";
import { useClaudeSetup } from "~/ai/hooks";
import { SettingControlWidth } from "~/settings/enums";
import { SettingRow } from "~/settings/setting-row";

const CLAUDE_SIGN_IN_QUERY_KEY = ["claude-signed-in"] as const;
// Claude sign-in finishes outside the app, so poll after starting it.
const SIGN_IN_POLL_MS = 3_000;
const SIGN_IN_WAIT_MS = 3 * 60_000;

async function claudeSignedIn() {
  const result = await coachCommands.claudeSignedIn();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

async function signInToClaude() {
  const result = await coachCommands.signInToClaude();
  if (result.status === "error") throw new Error(result.error);
}

export function useClaudeSignIn() {
  return useProviderSignIn("claude");
}

export function useProviderSignIn(provider: CoachProvider) {
  const setup = useClaudeSetup(provider);
  const queryClient = useQueryClient();
  const queryKey =
    provider === "claude" ? CLAUDE_SIGN_IN_QUERY_KEY : ["codex-signed-in"];
  const signIn = useMutation({
    mutationKey: ["provider-sign-in", provider],
    mutationFn: async () => {
      if (provider === "claude") return signInToClaude();
      const result = await coachCommands.signInToProvider(provider);
      if (result.status === "error") throw new Error(result.error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const status = useQuery({
    queryKey,
    queryFn: async () => {
      if (provider === "claude") return claudeSignedIn();
      const result = await coachCommands.providerAccount(provider);
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    enabled: setup.ready,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      signIn.isSuccess &&
      query.state.data?.signed_in === false &&
      Date.now() - signIn.submittedAt < SIGN_IN_WAIT_MS
        ? SIGN_IN_POLL_MS
        : false,
  });
  return {
    setup,
    signedIn: status.data?.signed_in,
    email: status.data?.email,
    error: setup.error ?? status.error ?? signIn.error,
    signingIn:
      signIn.isPending ||
      (signIn.isSuccess && status.data?.signed_in === false),
    signIn: () => signIn.mutate(),
  };
}

export function ClaudeSignInRow({
  provider = "claude",
}: {
  provider?: CoachProvider;
}) {
  const { setup, signedIn, email, error, signingIn, signIn } =
    useProviderSignIn(provider);
  const failed = setup.setup?.state === "failed";
  return (
    <SettingRow
      title={
        provider === "claude" ? (
          <Trans>Claude sign-in</Trans>
        ) : (
          <Trans>Codex sign-in</Trans>
        )
      }
      description={
        error ? (
          <span role="alert" className="text-destructive">
            {error.message}
          </span>
        ) : setup.setup && !setup.ready ? (
          <span
            role={failed ? "alert" : "status"}
            className={failed ? "text-destructive" : undefined}
          >
            <ClaudeSetupLabel setup={setup.setup} provider={provider} />
          </span>
        ) : signedIn === undefined ? (
          <Trans>Checking…</Trans>
        ) : signedIn ? (
          email ? (
            <Trans>Signed in as {email}</Trans>
          ) : (
            <Trans>Signed in</Trans>
          )
        ) : signingIn ? (
          <Trans>Finish signing in in the window that opened.</Trans>
        ) : (
          <Trans>Not signed in</Trans>
        )
      }
      controlWidth={SettingControlWidth.Content}
    >
      {({ "aria-describedby": describedBy }) =>
        failed ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            aria-describedby={describedBy}
            disabled={setup.retrying}
            onClick={setup.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        ) : (
          <Button
            type="button"
            variant={signedIn === false ? "default" : "secondary"}
            size="sm"
            aria-describedby={describedBy}
            disabled={signingIn || !setup.ready}
            onClick={signIn}
          >
            {signedIn ? <Trans>Switch account</Trans> : <Trans>Sign in</Trans>}
          </Button>
        )
      }
    </SettingRow>
  );
}
