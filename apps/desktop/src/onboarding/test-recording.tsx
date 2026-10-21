import { Trans } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "@anlg/ui/components/ui/button";

import { createSession } from "~/session/queries";
import { softDeleteSession } from "~/session/queries/deletion";
import { openSessionAndListen } from "~/shared/useNewNote";
import { DEFAULT_USER_ID } from "~/shared/utils";
import { useListener } from "~/stt/contexts";

const TEST_RECORDING_ID = "cue-onboarding-test-recording-v1";

export function TestRecordingSection() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recording = useListener(
    (state) =>
      Boolean(sessionId) &&
      state.live.sessionId === sessionId &&
      state.live.status !== "inactive",
  );

  const startTestRecording = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const event = {
        tracking_id: TEST_RECORDING_ID,
        calendar_id: "",
        title: "Cue test recording",
        started_at: now,
        ended_at: "",
        is_all_day: false,
        has_recurrence_rules: false,
      };
      const id = await createSession("Cue test recording", DEFAULT_USER_ID, {
        event_json: JSON.stringify(event),
      });
      setSessionId(id);
      openSessionAndListen(id, { behavior: "new" });
    } catch (error) {
      console.error("[onboarding] failed to start a test recording", error);
    } finally {
      setBusy(false);
    }
  };

  const deleteTestRecording = async () => {
    if (!sessionId || recording) return;
    setBusy(true);
    try {
      await softDeleteSession(sessionId);
      setSessionId(null);
    } catch (error) {
      console.error("[onboarding] failed to delete the test recording", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div className="text-ui font-medium">
        <Trans>Try a short test recording</Trans>
      </div>
      <p className="text-muted-foreground text-body">
        <Trans>
          Cue saves the recording on this Mac. If you have transcription set up,
          the selected transcription provider will process it using your current
          provider settings. Nothing starts until you choose this option.
        </Trans>
      </p>
      {sessionId ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-body" role="status">
            <Trans>
              Test note created. Return here after checking it to delete it.
            </Trans>
          </p>
          {recording && (
            <p className="text-muted-foreground text-body">
              <Trans>
                Stop the test recording in its note before deleting it.
              </Trans>
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || recording}
            onClick={() => void deleteTestRecording()}
          >
            <Trans>Delete test note</Trans>
          </Button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void startTestRecording()}
          >
            <Trans>Try a short test recording</Trans>
          </Button>
        </div>
      )}
    </section>
  );
}
