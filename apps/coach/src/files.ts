import { realpathSync, statSync } from "node:fs";
import path from "node:path";

import { isInside } from "./guard";

export const IMAGE_FILE_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_FILE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export type ImageFile = { ok: true; file: string; type: string } | { ok: false; status: number; reason: string };

function real(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

export function resolveImageFile(requested: string, project: string, roots: readonly string[]): ImageFile {
  if (!requested.trim()) return { ok: false, status: 400, reason: "No file was named." };
  const type = IMAGE_FILE_TYPES[path.extname(requested).toLowerCase()];
  if (!type) return { ok: false, status: 415, reason: "Only PNG, JPEG, WebP, GIF or SVG images can be shown." };
  const target = path.resolve(project, requested);
  const realRoots = roots.flatMap((root) => real(root) ?? []);
  const file = real(target);
  const inside = (candidate: string, within: readonly string[]) => within.some((root) => isInside(root, candidate));
  if (!file) {
    return inside(target, [...roots, ...realRoots])
      ? { ok: false, status: 404, reason: "That image doesn't exist." }
      : { ok: false, status: 403, reason: "That file is outside the meeting's folders." };
  }
  if (!inside(file, realRoots)) return { ok: false, status: 403, reason: "That file is outside the meeting's folders." };
  const stats = statSync(file);
  if (!stats.isFile()) return { ok: false, status: 404, reason: "That image doesn't exist." };
  if (stats.size > IMAGE_FILE_MAX_BYTES) return { ok: false, status: 413, reason: "That image is too large to show." };
  return { ok: true, file, type };
}

export function imageHeaders(type: string): Record<string, string> {
  return {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; sandbox",
    "cache-control": "no-store",
  };
}
