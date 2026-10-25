import { describe, expect, it } from "vitest";

import {
  applyDisclosureAttempt,
  applyExplicitConsentResponse,
  applyLateJoiner,
  interpretChatAsConsentResponse,
  sessionHasLegalConsent,
  sessionListeningPolicy,
  type DisclosureAttempt,
} from "./meeting-consent";

import {
  DisclosureDelivery,
  DisclosurePlatform,
  ParticipantConsentStatus,
  ParticipantConsentSource,
} from "~/stt/enums";

const DISCLOSURE = "I'm using Cue to record and transcribe this meeting.";

function attempt(
  delivery: DisclosureAttempt["delivery"] = DisclosureDelivery.Sent,
): DisclosureAttempt {
  return {
    id: "attempt-1",
    sessionId: "session-1",
    attemptedAt: "2026-08-21T00:00:00.000Z",
    platform: DisclosurePlatform.SlackHuddle,
    surface: "huddle",
    messageVersion: "cue-disclosure-v2",
    message: DISCLOSURE,
    delivery,
    failureReason: "",
  };
}

describe("meeting consent model", () => {
  it("does not treat a sent disclosure as participant consent", () => {
    const consents = applyDisclosureAttempt(
      [],
      attempt(DisclosureDelivery.Sent),
    );
    expect(consents).toEqual([]);
    expect(
      sessionHasLegalConsent(consents, [attempt(DisclosureDelivery.Sent)]),
    ).toBe(false);
    expect(sessionListeningPolicy(consents)).toBe("continue");
  });

  it("keeps late joiners unknown until they answer explicitly", () => {
    const consents = applyLateJoiner(
      [],
      "session-1",
      "late-joiner",
      "2026-08-21T00:01:00.000Z",
    );
    expect(consents).toEqual([
      {
        sessionId: "session-1",
        participantKey: "late-joiner",
        status: "unknown",
        source: "unseen",
        updatedAt: "2026-08-21T00:01:00.000Z",
      },
    ]);
    expect(
      sessionHasLegalConsent(consents, [attempt(DisclosureDelivery.Sent)]),
    ).toBe(false);
  });

  it("stops listening only after an explicit decline, not after delivery", () => {
    const declined = applyExplicitConsentResponse([], {
      sessionId: "session-1",
      participantKey: "ada",
      status: ParticipantConsentStatus.Declined,
      source: ParticipantConsentSource.ExplicitChatReply,
      updatedAt: "2026-08-21T00:02:00.000Z",
    });
    expect(sessionListeningPolicy(declined)).toBe("stop_declined");
    expect(
      sessionHasLegalConsent(declined, [attempt(DisclosureDelivery.Sent)]),
    ).toBe(false);
  });

  it("records per-participant consent without claiming legal consent for the room", () => {
    const consents = applyExplicitConsentResponse([], {
      sessionId: "session-1",
      participantKey: "ada",
      status: ParticipantConsentStatus.Consented,
      source: ParticipantConsentSource.ExplicitChatReply,
      updatedAt: "2026-08-21T00:02:00.000Z",
    });
    expect(consents[0]?.status).toBe("consented");
    expect(
      sessionHasLegalConsent(consents, [attempt(DisclosureDelivery.Sent)]),
    ).toBe(false);
    expect(sessionListeningPolicy(consents)).toBe("continue");
  });

  it("ignores the disclosure text itself when classifying chat replies", () => {
    expect(interpretChatAsConsentResponse(DISCLOSURE, DISCLOSURE)).toBeNull();
    expect(interpretChatAsConsentResponse("I do not consent", DISCLOSURE)).toBe(
      "declined",
    );
    expect(interpretChatAsConsentResponse("I consent", DISCLOSURE)).toBe(
      "consented",
    );
    expect(
      interpretChatAsConsentResponse("sounds good", DISCLOSURE),
    ).toBeNull();
  });

  it("rejects unseen as an explicit consent source", () => {
    expect(() =>
      applyExplicitConsentResponse([], {
        sessionId: "session-1",
        participantKey: "ada",
        status: ParticipantConsentStatus.Consented,
        source: ParticipantConsentSource.Unseen,
        updatedAt: "2026-08-21T00:02:00.000Z",
      }),
    ).toThrow(/unseen/);
  });
});
