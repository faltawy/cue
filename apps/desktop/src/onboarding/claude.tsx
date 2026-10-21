import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { commands as coachCommands } from "@anlg/plugin-coach";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";

import { OnboardingButton } from "./shared";
import { TranscriptionReadiness } from "./transcription-readiness";

import { ClaudeSetupLabel } from "~/ai/claude-setup-label";
import { COACH_SETTINGS_QUERY_KEY, useCoachSettings } from "~/ai/hooks";
import { useProviderSignIn } from "~/settings/claude/sign-in";

export function ClaudeSection({ onContinue }: { onContinue: () => void }) {
  const { t } = useLingui();
  const settings = useCoachSettings();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (provider: "claude" | "codex") => {
      if (!settings.data) throw new Error("AI settings are unavailable.");
      const next = { ...settings.data, provider };
      const result = await coachCommands.setSettings(next);
      if (result.status === "error") throw new Error(result.error);
      return next;
    },
    onSuccess: (next) => client.setQueryData(COACH_SETTINGS_QUERY_KEY, next),
  });
  const provider = settings.data?.provider ?? "claude";
  return (
    <div className="flex flex-col gap-4">
      <Select
        value={provider}
        disabled={!settings.data || save.isPending}
        onValueChange={(value) =>
          save.mutate(value === "codex" ? "codex" : "claude")
        }
      >
        <SelectTrigger aria-label={t`Provider`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude">Claude</SelectItem>
          <SelectItem value="codex">Codex</SelectItem>
        </SelectContent>
      </Select>
      <ProviderSignIn
        key={provider}
        provider={provider}
        onContinue={onContinue}
      />
      <TranscriptionReadiness />
      {(save.error ?? settings.error) && (
        <p role="alert" className="text-destructive text-body">
          {(save.error ?? settings.error)?.message}
        </p>
      )}
    </div>
  );
}

function ProviderSignIn({
  provider,
  onContinue,
}: {
  provider: "claude" | "codex";
  onContinue: () => void;
}) {
  const { setup, signedIn, error, signingIn, signIn } =
    useProviderSignIn(provider);
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
          {provider === "claude" ? (
            <Trans>Sign in to Claude</Trans>
          ) : (
            <Trans>Sign in to Codex</Trans>
          )}
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
          <ClaudeSetupLabel setup={setup.setup} provider={provider} />
        </p>
      )}
      {signingIn && (
        <p className="text-muted-foreground text-body" aria-live="polite">
          <Trans>
            Finish signing in in the window that opened, then come back here.
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
