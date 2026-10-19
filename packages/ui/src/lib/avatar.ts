export const AVATAR_TINTS = 6;

/** The person's tint, 1–6, picked from the `--speaker-N` palette by seed. */
export function avatarTint(seed: string) {
  return (hashString(seed) % AVATAR_TINTS) + 1;
}

export function avatarInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) =>
      Array.from(part.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "")),
    )
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function hashString(value: string) {
  let hash = 2166136261;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
