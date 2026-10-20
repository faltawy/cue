import { Trans } from "@lingui/react/macro";

import { OnboardingButton } from "./shared";

import { useClaudeSignIn } from "~/settings/claude/sign-in";

export function ClaudeSection({ onContinue }: { onContinue: () => void }) {
  const { signedIn, error, signingIn, signIn } = useClaudeSignIn();

  return (
    <div className="flex flex-col gap-4">
      {signedIn ? (
        <OnboardingButton onClick={onContinue}>
          <Trans>Continue</Trans>
        </OnboardingButton>
      ) : (
        <OnboardingButton
          onClick={signIn}
          disabled={signingIn || signedIn === undefined}
        >
          <Trans>Sign in to Claude</Trans>
        </OnboardingButton>
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
