import type { useRunBatch } from "~/stt/useRunBatch";

export async function transcribeDictation(
  runBatch: ReturnType<typeof useRunBatch>,
  path: string,
  signal: AbortSignal,
) {
  let text = "";
  await runBatch(path, {
    signal,
    deferAudioFinalization: true,
    notifyOnCompletion: false,
    numSpeakers: 1,
    handlePersist: (words) => {
      text = words
        .slice()
        .sort((a, b) => a.start_ms - b.start_ms)
        .map((word) => word.text)
        .join("")
        .replace(/\s+/gu, " ")
        .trim();
    },
  });
  return text;
}
