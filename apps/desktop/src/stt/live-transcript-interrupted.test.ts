import { describe, expect, it } from "vitest";

import type { DegradedError } from "@anlg/plugin-transcription";

import { getLiveTranscriptPausedMessage } from "./live-transcript-interrupted";

describe("getLiveTranscriptPausedMessage", () => {
  it("names the provider when it reports an outage", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "stream_error", message: "deepgram: overloaded" },
        sttProvider: "deepgram",
        online: true,
      }),
    ).toMatch(/because Deepgram is having an outage\./);
  });

  it("separates a provider-side outage from an unreachable provider", () => {
    const upstream = getLiveTranscriptPausedMessage({
      degraded: {
        type: "stream_error",
        message: "RemoteClosed(code=Some(4500), reason=provider error)",
      },
      sttProvider: "soniox",
      online: true,
    });
    const server = getLiveTranscriptPausedMessage({
      degraded: {
        type: "stream_error",
        message: "RemoteClosed(code=Some(1011), reason=)",
      },
      sttProvider: "soniox",
      online: true,
    });

    expect(upstream).toMatch(/because Soniox is having an outage\./);
    expect(server).toMatch(/Cue can't reach Soniox/);
  });

  it("blames the connection when offline", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "connection_timeout" },
        sttProvider: "soniox",
        online: false,
      }),
    ).toMatch(/because you're offline\./);
  });

  it("tells a slow connection apart from an unreachable provider and a rejected key", () => {
    const pausedBecause = (degraded: DegradedError) =>
      getLiveTranscriptPausedMessage({
        degraded,
        sttProvider: "soniox",
        online: true,
      });

    expect(pausedBecause({ type: "connection_timeout" })).toBe(
      "Slow connection to Soniox. Live transcript is retrying. Your audio is still being saved, and the missing part will be filled in from the recording.",
    );
    expect(
      pausedBecause({
        type: "upstream_unavailable",
        message: "connect failed on attempt 3/3: Connection refused",
      }),
    ).toMatch(/^Live transcript paused because Cue can't reach Soniox\./);
    expect(
      pausedBecause({ type: "authentication_failed", provider: "soniox" }),
    ).toMatch(
      /rejected your API key\. Check your transcription key in Settings\./,
    );
  });

  it("does not blame the network for on-device models", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "connection_timeout" },
        sttProvider: "soniqo",
        online: false,
      }),
    ).toMatch(/the local transcription model stopped responding/);
  });
});
