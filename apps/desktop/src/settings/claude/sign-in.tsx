import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";

import { commands as coachCommands } from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";

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
  const signIn = useMutation({ mutationFn: signInToClaude });
  const status = useQuery({
    queryKey: CLAUDE_SIGN_IN_QUERY_KEY,
    queryFn: claudeSignedIn,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      signIn.isSuccess &&
      query.state.data === false &&
      Date.now() - signIn.submittedAt < SIGN_IN_WAIT_MS
        ? SIGN_IN_POLL_MS
        : false,
  });
  return {
    signedIn: status.data,
    error: status.error ?? signIn.error,
    signingIn: signIn.isPending || (signIn.isSuccess && status.data === false),
    signIn: () => signIn.mutate(),
  };
}

export function ClaudeSignInRow() {
  const { signedIn, error, signingIn, signIn } = useClaudeSignIn();
  return (
    <SettingRow
      title={<Trans>Claude sign-in</Trans>}
      description={
        error ? (
          <span role="alert" className="text-destructive">
            {error.message}
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
      {({ "aria-describedby": describedBy }) => (
        <Button
          type="button"
          variant={signedIn === false ? "default" : "outline"}
          size="sm"
          aria-describedby={describedBy}
          disabled={signingIn}
          onClick={signIn}
        >
          {signedIn ? <Trans>Sign in again</Trans> : <Trans>Sign in</Trans>}
        </Button>
      )}
    </SettingRow>
  );
}
