import {
  fitWithin,
  IMAGE_ERRORS,
  type ImageType,
  isImageType,
  MAX_EDGE,
  MAX_IMAGE_BASE64,
  MAX_THUMB_CHARS,
  THUMB_EDGE,
} from "../image-limits";

export type PreparedImage = { media_type: ImageType; data: string; thumb: string; width: number; height: number };

export type EncodePlan = { width: number; height: number; mediaType: ImageType; reencode: boolean };

export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function encodePlan(type: ImageType, width: number, height: number, bytes: number): EncodePlan {
  const fit = fitWithin(width, height, MAX_EDGE);
  const resized = fit.width !== width || fit.height !== height;
  if (!resized && base64Length(bytes) <= MAX_IMAGE_BASE64) return { ...fit, mediaType: type, reencode: false };
  return { ...fit, mediaType: type === "image/gif" ? "image/png" : type, reencode: true };
}

class ImageError extends Error {}

function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new ImageError(IMAGE_ERRORS.unreadable));
    reader.readAsDataURL(blob);
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError(IMAGE_ERRORS.unreadable);
  if (opaque) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageError(IMAGE_ERRORS.unreadable))), type, quality),
  );
}

async function encode(bitmap: ImageBitmap, plan: EncodePlan): Promise<{ data: string; mediaType: ImageType }> {
  const canvas = draw(bitmap, plan.width, plan.height, plan.mediaType === "image/jpeg");
  const first = await toBlob(canvas, plan.mediaType, 0.9);
  const type = isImageType(first.type) ? first.type : "image/png";
  if (base64Length(first.size) <= MAX_IMAGE_BASE64) return { data: await readBase64(first), mediaType: type };
  const jpeg = await toBlob(draw(bitmap, plan.width, plan.height, true), "image/jpeg", 0.85);
  if (base64Length(jpeg.size) > MAX_IMAGE_BASE64) throw new ImageError(IMAGE_ERRORS.size);
  return { data: await readBase64(jpeg), mediaType: "image/jpeg" };
}

function thumbnail(bitmap: ImageBitmap): string {
  const size = fitWithin(bitmap.width, bitmap.height, THUMB_EDGE);
  const canvas = draw(bitmap, size.width, size.height, true);
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return url.length <= MAX_THUMB_CHARS ? url : canvas.toDataURL("image/jpeg", 0.5);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!isImageType(file.type)) throw new ImageError(IMAGE_ERRORS.type);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError(IMAGE_ERRORS.unreadable);
  }
  try {
    const plan = encodePlan(file.type, bitmap.width, bitmap.height, file.size);
    const encoded = plan.reencode ? await encode(bitmap, plan) : { data: await readBase64(file), mediaType: file.type };
    return { media_type: encoded.mediaType, data: encoded.data, thumb: thumbnail(bitmap), width: plan.width, height: plan.height };
  } finally {
    bitmap.close();
  }
}

export function imageErrorMessage(error: unknown): string {
  return error instanceof ImageError ? error.message : IMAGE_ERRORS.unreadable;
}
