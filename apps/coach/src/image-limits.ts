export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const MAX_IMAGES = 4;
export const MAX_EDGE = 1568;
export const THUMB_EDGE = 192;
export const MAX_IMAGE_BASE64 = 5 * 1024 * 1024;
export const MAX_THUMB_CHARS = 64_000;

export const IMAGE_ERRORS = {
  type: "Only PNG, JPEG, WebP or GIF images can be attached.",
  count: `Up to ${MAX_IMAGES} images per question.`,
  unreadable: "Couldn't read that image. Try a PNG or JPEG.",
  size: "That image is too large to send, even after shrinking it.",
} as const;

export type ImageThumb = { thumb: string; width: number; height: number };

export function isImageType(type: string): type is ImageType {
  return IMAGE_TYPES.some((allowed) => allowed === type);
}

export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= edge) return { width, height };
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function admitFiles<T extends { type: string }>(
  files: readonly T[],
  attached: number,
): { accepted: T[]; error: string | null } {
  const images = files.filter((file) => isImageType(file.type));
  const room = Math.max(0, MAX_IMAGES - attached);
  const accepted = images.slice(0, room);
  const error =
    images.length < files.length ? IMAGE_ERRORS.type : images.length > room ? IMAGE_ERRORS.count : null;
  return { accepted, error };
}
