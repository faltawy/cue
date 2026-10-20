import { Trans } from "@lingui/react/macro";

import { OnboardingButton } from "./shared";

import { ClaudeSetupLabel } from "~/ai/claude-setup-label";
import { useClaudeSignIn } from "~/settings/claude/sign-in";

export function ClaudeSection({ onContinue }: { onContinue: () => void }) {
  const { setup, signedIn, error, signingIn, signIn } = useClaudeSignIn();
  const failed = setup.setup?.state === "failed";

  return (
    <div className="flex flex-col gap-4">
      {signedIn ? (
        <OnboardingButton onClick={onContinue}>
          <Trans>Continue</Trans>
        </OnboardingButton>
      ) : failed ? (
        <OnboardingButton onClick={setup.retry} disabled={setup.retrying}>
          <Trans>Retry</Trans>
        </OnboardingButton>
      ) : (
        <OnboardingButton
          onClick={signIn}
          disabled={signingIn || !setup.ready || signedIn === undefined}
        >
          <Trans>Sign in to Claude</Trans>
        </OnboardingButton>
      )}
      {setup.setup && !setup.ready && (
        <p
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className={
            failed
              ? "text-destructive text-body"
              : "text-muted-foreground text-body"
          }
        >
          <ClaudeSetupLabel setup={setup.setup} />
        </p>
      )}
      {signingIn && (
        <p className="text-muted-foreground text-body" aria-live="polite">
          <Trans>
            Finish signing in in the Terminal window that opened, then come back
            here.
          </Trans>
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-body">
          {error.message}
        </p>
      )}
    </div>
  );
}
