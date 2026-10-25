import { describe, expect, it } from "vitest";

import { SessionNoteViewType } from "@anlg/utils/session";

import { shouldShowSessionTopAudioPlayer } from "./top-audio-player";

describe("shouldShowSessionTopAudioPlayer", () => {
  it("shows playback only on the transcript tab", () => {
    expect(
      shouldShowSessionTopAudioPlayer({
        audioExists: true,
        audioUrlReady: true,
        currentView: { type: SessionNoteViewType.Transcript },
        sessionMode: "inactive",
      }),
    ).toBe(true);

    expect(
      shouldShowSessionTopAudioPlayer({
        audioExists: true,
        audioUrlReady: true,
        currentView: { type: SessionNoteViewType.Enhanced, id: "summary-1" },
        sessionMode: "inactive",
      }),
    ).toBe(false);
  });

  it("keeps playback hidden while recording or finalizing", () => {
    expect(
      shouldShowSessionTopAudioPlayer({
        audioExists: true,
        audioUrlReady: true,
        currentView: { type: SessionNoteViewType.Transcript },
        sessionMode: "active",
      }),
    ).toBe(false);

    expect(
      shouldShowSessionTopAudioPlayer({
        audioExists: true,
        audioUrlReady: true,
        currentView: { type: SessionNoteViewType.Transcript },
        sessionMode: "finalizing",
      }),
    ).toBe(false);
  });
});
