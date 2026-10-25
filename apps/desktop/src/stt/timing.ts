import { TranscriptTimingSource } from "~/stt/enums";
export { TranscriptTimingSource };

export type TranscriptWordMetadata = Record<string, unknown>;

export function createTranscriptTimingMetadata(
  source: TranscriptTimingSource,
  metadata?: unknown,
): TranscriptWordMetadata {
  const base = isRecord(metadata) ? metadata : {};
  const timing = isRecord(base.timing) ? base.timing : {};

  return {
    ...base,
    timing: {
      ...timing,
      source,
    },
  };
}

export function getTranscriptTimingSource(word: {
  metadata?: unknown;
}): TranscriptTimingSource {
  const metadata = word.metadata;
  if (!isRecord(metadata)) {
    return TranscriptTimingSource.ProviderWord;
  }

  const timing = metadata.timing;
  if (!isRecord(timing)) {
    return (
      getValidTimingSource(metadata.timing_source) ??
      TranscriptTimingSource.ProviderWord
    );
  }

  return (
    getValidTimingSource(timing.source) ??
    getValidTimingSource(metadata.timing_source) ??
    TranscriptTimingSource.ProviderWord
  );
}

export function isTranscriptWordSeekable(word: { metadata?: unknown }) {
  return (
    getTranscriptTimingSource(word) !== TranscriptTimingSource.SyntheticText
  );
}

export function getValidTimingSource(
  source: unknown,
): TranscriptTimingSource | undefined {
  return source === TranscriptTimingSource.ProviderWord ||
    source === TranscriptTimingSource.ProviderSegmentInterpolated ||
    source === TranscriptTimingSource.SyntheticText
    ? source
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
