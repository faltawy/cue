import { Trans } from "@lingui/react/macro";

import { Button } from "@anlg/ui/components/ui/button";

import { useConfigValues } from "~/shared/config";
import { useTabs } from "~/store/zustand/tabs";
import { isConfiguredSttModel } from "~/stt/capabilities";

export function TranscriptionReadiness() {
  const { current_stt_provider, current_stt_model } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
  ] as const);
  const configured = isConfiguredSttModel(
    current_stt_provider,
    current_stt_model,
  );
  const openCurrent = useTabs((state) => state.openCurrent);

  return (
    <section className="border-border flex flex-col items-start gap-2 rounded-md border p-3">
      <h3 className="text-ui font-medium">
        <Trans>Transcription</Trans>
      </h3>
      <p className="text-muted-foreground text-body">
        {configured ? (
          <Trans>
            A model is selected. Provider access and model readiness determine
            when transcripts are available.
          </Trans>
        ) : (
          <Trans>
            Recording works without transcription. Set up a transcription model
            before Cue can create transcripts or summaries.
          </Trans>
        )}
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          openCurrent({ type: "settings", state: { tab: "transcription" } })
        }
      >
        <Trans>Open transcription settings</Trans>
      </Button>
    </section>
  );
}
