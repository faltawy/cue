import { type Word } from "./transcript";

export enum SpeakerTargetKind {
  Words = "words",
  Speaker = "speaker",
  Channel = "channel",
}

export type SpeakerHint = { word_id: string; type: string; value: string };

type Scope =
  | { kind: SpeakerTargetKind.Words; wordIds: string[] }
  | { kind: SpeakerTargetKind.Speaker; channel: number; speakerIndex: number }
  | { kind: SpeakerTargetKind.Channel; channel: number };

export type Assignment = { humanId: string; scope: Scope };

export type SpeakerContext = {
  names: Map<string, string>;
  selfHumanId: string;
  participantHumanIds: string[];
};

function parse(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch {
    return null;
  }
}

export function withProviderSpeakers(
  words: Word[],
  hints: SpeakerHint[],
): Word[] {
  const byWord = new Map<string, number>();
  for (const hint of hints) {
    if (hint.type !== "provider_speaker_index") continue;
    const value = parse(hint.value);
    if (typeof value?.speaker_index === "number")
      byWord.set(hint.word_id, value.speaker_index);
  }
  return words.map((word) =>
    word.speaker_index == null && byWord.has(word.id)
      ? { ...word, speaker_index: byWord.get(word.id) }
      : word,
  );
}

function assignmentFrom(
  hint: SpeakerHint,
  wordsById: Map<string, Word>,
): Assignment | null {
  const value = parse(hint.value);
  const humanId = value?.human_id;
  if (!value || typeof humanId !== "string" || !humanId.trim()) return null;

  if (value.scope === "speaker" && typeof value.channel === "number") {
    return typeof value.speaker_index === "number"
      ? {
          humanId,
          scope: {
            kind: SpeakerTargetKind.Speaker,
            channel: value.channel,
            speakerIndex: value.speaker_index,
          },
        }
      : {
          humanId,
          scope: { kind: SpeakerTargetKind.Channel, channel: value.channel },
        };
  }
  if (value.scope === "segment" && Array.isArray(value.word_ids)) {
    const wordIds = value.word_ids.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    return wordIds.length > 0
      ? { humanId, scope: { kind: SpeakerTargetKind.Words, wordIds } }
      : null;
  }

  const anchor = wordsById.get(hint.word_id);
  if (!anchor) return null;
  return anchor.speaker_index == null
    ? {
        humanId,
        scope: { kind: SpeakerTargetKind.Channel, channel: anchor.channel },
      }
    : {
        humanId,
        scope: {
          kind: SpeakerTargetKind.Speaker,
          channel: anchor.channel,
          speakerIndex: anchor.speaker_index,
        },
      };
}

export function assignmentsFrom(
  hints: SpeakerHint[],
  words: Word[],
): Assignment[] {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const ordered = [
    ...hints.filter((hint) => hint.type === "automatic_speaker_assignment"),
    ...hints.filter((hint) => hint.type === "user_speaker_assignment"),
  ];
  return ordered.flatMap((hint) => assignmentFrom(hint, wordsById) ?? []);
}

export function speakerLabels(
  words: Word[],
  assignments: Assignment[],
  context: SpeakerContext,
): Map<string, string> {
  const byWord = new Map<string, string>();
  const bySpeaker = new Map<string, string>();
  const byChannel = new Map<number, string>();
  for (const { humanId, scope } of assignments) {
    if (scope.kind === SpeakerTargetKind.Words)
      for (const id of scope.wordIds) byWord.set(id, humanId);
    else if (scope.kind === SpeakerTargetKind.Speaker)
      bySpeaker.set(`${scope.channel}:${scope.speakerIndex}`, humanId);
    else byChannel.set(scope.channel, humanId);
  }

  const others = [...new Set(context.participantHumanIds)].filter(
    (id) => id !== context.selfHumanId,
  );
  const soleRemote = others.length === 1 ? others[0] : undefined;

  const labels = new Map<string, string>();
  for (const word of words) {
    const specific =
      byWord.get(word.id) ??
      bySpeaker.get(`${word.channel}:${word.speaker_index}`);
    const humanId =
      word.channel === 0
        ? specific
        : (specific ??
          byChannel.get(word.channel) ??
          (word.channel === 1 ? soleRemote : undefined));
    const name =
      humanId && humanId !== context.selfHumanId
        ? context.names.get(humanId)?.trim()
        : undefined;

    labels.set(
      word.id,
      name ||
        (word.channel === 0 || humanId === context.selfHumanId
          ? "You"
          : word.speaker_index == null
            ? "Them"
            : `Speaker ${word.speaker_index + 1}`),
    );
  }
  return labels;
}
