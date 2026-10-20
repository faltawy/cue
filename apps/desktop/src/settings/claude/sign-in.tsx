import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";

import { commands as coachCommands } from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";

import { ClaudeSetupLabel } from "~/ai/claude-setup-label";
import { useClaudeSetup } from "~/ai/hooks";
import { SettingRow } from "~/settings/setting-row";

const CLAUDE_SIGN_IN_QUERY_KEY = ["claude-signed-in"] as const;
// Sign-in finishes in Terminal, so poll for a while after starting it.
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
  const setup = useClaudeSetup();
  const signIn = useMutation({ mutationFn: signInToClaude });
  const status = useQuery({
    queryKey: CLAUDE_SIGN_IN_QUERY_KEY,
    queryFn: claudeSignedIn,
    enabled: setup.ready,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      signIn.isSuccess &&
      query.state.data === false &&
      Date.now() - signIn.submittedAt < SIGN_IN_WAIT_MS
        ? SIGN_IN_POLL_MS
        : false,
  });
  return {
    setup,
    signedIn: status.data,
    error: setup.error ?? status.error ?? signIn.error,
    signingIn: signIn.isPending || (signIn.isSuccess && status.data === false),
    signIn: () => signIn.mutate(),
  };
}

export function ClaudeSignInRow() {
  const { setup, signedIn, error, signingIn, signIn } = useClaudeSignIn();
  const failed = setup.setup?.state === "failed";
  return (
    <SettingRow
      title={<Trans>Claude sign-in</Trans>}
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
            <ClaudeSetupLabel setup={setup.setup} />
          </span>
        ) : signedIn === undefined ? (
          <Trans>Checking…</Trans>
        ) : signedIn ? (
          <Trans>Signed in</Trans>
        ) : signingIn ? (
          <Trans>Finish signing in in Terminal.</Trans>
        ) : (
          <Trans>Not signed in</Trans>
        )
      }
      controlWidth="content"
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
            variant={signedIn === false ? "default" : "outline"}
            size="sm"
            aria-describedby={describedBy}
            disabled={signingIn || !setup.ready}
            onClick={signIn}
          >
            {signedIn ? <Trans>Sign in again</Trans> : <Trans>Sign in</Trans>}
          </Button>
        )
      }
    </SettingRow>
  );
}
