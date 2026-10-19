import type { SegmentKey, SegmentWord } from "~/stt/live-segment";

export type HighlightSegment = { text: string; isMatch: boolean };

export type SentenceLine = {
  words: SegmentWord[];
  startMs: number;
  endMs: number;
};

// Latin, Arabic (؟ ۔) and full-width CJK (。？！) sentence marks.
const SENTENCE_END = /[.?!؟۔。？！]$/;

function endsSentence(word: SegmentWord) {
  return SENTENCE_END.test(word.text.trim());
}

export function groupWordsIntoLines(words: SegmentWord[]): SentenceLine[] {
  if (words.length === 0) return [];

  const lines: SentenceLine[] = [];
  let currentLine: SegmentWord[] = [];

  for (const word of words) {
    currentLine.push(word);
    if (endsSentence(word)) {
      lines.push({
        words: currentLine,
        startMs: currentLine[0]!.start_ms,
        endMs: currentLine[currentLine.length - 1]!.end_ms,
      });
      currentLine = [];
    }
  }

  if (currentLine.length > 0) {
    lines.push({
      words: currentLine,
      startMs: currentLine[0]!.start_ms,
      endMs: currentLine[currentLine.length - 1]!.end_ms,
    });
  }

  return lines;
}

export function getActiveLineIndex(
  words: SegmentWord[],
  offsetMs: number,
  currentMs: number,
): number | null {
  if (currentMs <= 0 || words.length === 0) return null;

  let lineIndex = 0;
  let lineStartMs = words[0]!.start_ms;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const closesLine = endsSentence(word) || index === words.length - 1;

    if (!closesLine) {
      continue;
    }

    const start = offsetMs + lineStartMs;
    const end = offsetMs + word.end_ms;
    if (currentMs >= start && currentMs <= end) {
      return lineIndex;
    }

    lineIndex += 1;
    lineStartMs = words[index + 1]?.start_ms ?? lineStartMs;
  }

  return null;
}

export const SPEAKER_SLOTS = 6;

export function getSegmentSpeakerSlot(key: SegmentKey): number | null {
  if (key.channel === "DirectMic" && !key.speaker_human_id) return null;

  let speakerIndex = key.speaker_index ?? 0;
  if (key.speaker_human_id) {
    speakerIndex = 0;
    for (const character of key.speaker_human_id) {
      speakerIndex =
        (Math.imul(speakerIndex, 31) + character.charCodeAt(0)) >>> 0;
    }
  }

  return (speakerIndex % SPEAKER_SLOTS) + 1;
}

export function getSegmentSpeakerColor(key: SegmentKey): string | null {
  const slot = getSegmentSpeakerSlot(key);
  return slot === null ? null : `var(--speaker-${slot})`;
}
