import {
  DisclosureDelivery,
  DisclosurePlatform,
  ParticipantConsentStatus,
  ParticipantConsentSource,
  SessionListeningPolicy,
} from "~/stt/enums";

export const MEETING_DISCLOSURE_MESSAGE_VERSION = "cue-disclosure-v2";

export { DisclosurePlatform };

export type DisclosureAttempt = {
  id: string;
  sessionId: string;
  attemptedAt: string;
  platform: DisclosurePlatform;
  surface: string;
  messageVersion: string;
  message: string;
  delivery: DisclosureDelivery;
  failureReason: string;
};

export { ParticipantConsentStatus };

export type ParticipantConsent = {
  sessionId: string;
  participantKey: string;
  status: ParticipantConsentStatus;
  source: ParticipantConsentSource;
  updatedAt: string;
};

export { SessionListeningPolicy };

const DECLINE_PATTERN =
  /\b((i\s+)?(do\s+not|don't|does\s+not|doesn't)\s+consent|stop\s+recording)\b/i;
const CONSENT_PATTERN = /\b(i\s+consent|i\s+agree\s+to\s+(being\s+)?record)/i;

export function applyDisclosureAttempt(
  consents: readonly ParticipantConsent[],
  _attempt: DisclosureAttempt,
): ParticipantConsent[] {
  return [...consents];
}

export function applyLateJoiner(
  consents: readonly ParticipantConsent[],
  sessionId: string,
  participantKey: string,
  updatedAt: string,
): ParticipantConsent[] {
  if (
    consents.some(
      (consent) =>
        consent.sessionId === sessionId &&
        consent.participantKey === participantKey,
    )
  ) {
    return [...consents];
  }
  return [
    ...consents,
    {
      sessionId,
      participantKey,
      status: ParticipantConsentStatus.Unknown,
      source: ParticipantConsentSource.Unseen,
      updatedAt,
    },
  ];
}

export function applyExplicitConsentResponse(
  consents: readonly ParticipantConsent[],
  next: ParticipantConsent,
): ParticipantConsent[] {
  if (next.source === ParticipantConsentSource.Unseen) {
    throw new Error("explicit consent cannot use the unseen source");
  }
  const without = consents.filter(
    (consent) =>
      !(
        consent.sessionId === next.sessionId &&
        consent.participantKey === next.participantKey
      ),
  );
  return [...without, next];
}

export function interpretChatAsConsentResponse(
  text: string,
  disclosureMessage: string,
): ParticipantConsentStatus | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized === disclosureMessage.replace(/\s+/g, " ").trim()) {
    return null;
  }
  if (DECLINE_PATTERN.test(normalized)) {
    return ParticipantConsentStatus.Declined;
  }
  if (CONSENT_PATTERN.test(normalized)) {
    return ParticipantConsentStatus.Consented;
  }
  return null;
}

export function sessionListeningPolicy(
  consents: readonly ParticipantConsent[],
): SessionListeningPolicy {
  return consents.some(
    (consent) => consent.status === ParticipantConsentStatus.Declined,
  )
    ? SessionListeningPolicy.StopDeclined
    : SessionListeningPolicy.Continue;
}

export function sessionHasLegalConsent(
  consents: readonly ParticipantConsent[],
  disclosureAttempts: readonly DisclosureAttempt[],
): boolean {
  void consents;
  void disclosureAttempts;
  return false;
}
