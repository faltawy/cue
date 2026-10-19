import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  IMAGE_ERRORS,
  IMAGE_TYPES,
  type ImageThumb,
  MAX_EDGE,
  MAX_IMAGE_BASE64,
  MAX_IMAGES,
  MAX_THUMB_CHARS,
  THUMB_EDGE,
} from "./image-limits";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const THUMB = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const imageSchema = z.object({
  media_type: z.enum(IMAGE_TYPES, { error: IMAGE_ERRORS.type }),
  data: z.string().max(MAX_IMAGE_BASE64, { error: IMAGE_ERRORS.size }).regex(BASE64, { error: IMAGE_ERRORS.unreadable }),
  thumb: z.string().max(MAX_THUMB_CHARS, { error: IMAGE_ERRORS.unreadable }).regex(THUMB, { error: IMAGE_ERRORS.unreadable }),
  width: z.number().int().min(1).max(MAX_EDGE, { error: IMAGE_ERRORS.size }),
  height: z.number().int().min(1).max(MAX_EDGE, { error: IMAGE_ERRORS.size }),
});

const imagesSchema = z.array(imageSchema).max(MAX_IMAGES, { error: IMAGE_ERRORS.count });

export type AskImage = z.infer<typeof imageSchema>;

export function parseAskImages(value: unknown): { ok: true; images: AskImage[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, images: [] };
  const parsed = imagesSchema.safeParse(value);
  if (parsed.success) return { ok: true, images: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? IMAGE_ERRORS.unreadable };
}

export function thumbsOf(images: readonly AskImage[]): ImageThumb[] {
  return images.map(({ thumb, width, height }) => {
    const scale = Math.min(1, THUMB_EDGE / Math.max(width, height));
    return { thumb, width: Math.round(width * scale) || 1, height: Math.round(height * scale) || 1 };
  });
}

export type AskContent = SDKUserMessage["message"]["content"];

export function askContent(text: string, images: readonly AskImage[]): AskContent {
  if (images.length === 0) return text;
  return [
    ...images.map((image) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: image.media_type, data: image.data },
    })),
    ...(text ? [{ type: "text" as const, text }] : []),
  ];
}
