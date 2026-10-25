import { AudioRetentionPolicy } from "~/services/enums";

export { AudioRetentionPolicy };

export function normalizeAudioRetention<
  T extends AudioRetentionPolicy | undefined = AudioRetentionPolicy.Forever,
>(value: unknown, fallback?: T): AudioRetentionPolicy | T {
  const policy = Object.values(AudioRetentionPolicy).find(
    (candidate) => candidate === value,
  );
  if (policy !== undefined) return policy;

  if (value === false) {
    return AudioRetentionPolicy.None;
  }

  if (value === true) {
    return AudioRetentionPolicy.Forever;
  }

  return arguments.length >= 2 ? (fallback as T) : AudioRetentionPolicy.Forever;
}
