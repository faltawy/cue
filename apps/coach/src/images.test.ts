import { describe, expect, test } from "bun:test";

import { admitFiles, fitWithin, IMAGE_ERRORS, MAX_EDGE, MAX_IMAGE_BASE64 } from "./image-limits";
import { askContent, parseAskImages, thumbsOf } from "./images";
import { encodePlan } from "./ui/images";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const THUMB = `data:image/jpeg;base64,${"/9j/4AAQSkZJRgABAQ".padEnd(400, "A")}`;
const image = (overrides: Record<string, unknown> = {}) => ({
  media_type: "image/png",
  data: PNG,
  thumb: THUMB,
  width: 1568,
  height: 980,
  ...overrides,
});

describe("images attached to an ask", () => {
  test("reach Claude as image blocks before the question text", () => {
    const parsed = parseAskImages([image(), image({ media_type: "image/webp" })]);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(askContent("What's wrong in this screenshot?", parsed.images)).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "image", source: { type: "base64", media_type: "image/webp", data: PNG } },
      { type: "text", text: "What's wrong in this screenshot?" },
    ]);
    expect(askContent("", parsed.images)).toHaveLength(2);
    expect(askContent("Plain question", [])).toBe("Plain question");
  });

  test.each([
    ["an unsupported type", [image({ media_type: "image/heic" })], IMAGE_ERRORS.type],
    ["an SVG", [image({ media_type: "image/svg+xml" })], IMAGE_ERRORS.type],
    ["five images", Array.from({ length: 5 }, () => image()), IMAGE_ERRORS.count],
    ["data that isn't base64", [image({ data: "<script>alert(1)</script>" })], IMAGE_ERRORS.unreadable],
    ["an image over the size limit", [image({ data: "A".repeat(MAX_IMAGE_BASE64 + 4) })], IMAGE_ERRORS.size],
    ["a thumbnail that isn't an image data URL", [image({ thumb: "https://tracker.example.com/pixel.gif" })], IMAGE_ERRORS.unreadable],
    ["a side longer than the bound", [image({ width: 4032 })], IMAGE_ERRORS.size],
  ])("rejects %s with plain copy", (_name, images, message) => {
    expect(parseAskImages(images)).toEqual({ ok: false, error: message });
  });

  test("history keeps only the small thumbnails, sized for the timeline", () => {
    const parsed = parseAskImages([image()]);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(thumbsOf(parsed.images)).toEqual([{ thumb: THUMB, width: 192, height: 120 }]);
    expect(JSON.stringify(thumbsOf(parsed.images))).not.toContain(PNG);
  });
});

describe("preparing images in the composer", () => {
  test("downscales the long edge to the bound and keeps the aspect", () => {
    expect(fitWithin(4032, 3024, MAX_EDGE)).toEqual({ width: 1568, height: 1176 });
    expect(fitWithin(1200, 9000, MAX_EDGE)).toEqual({ width: 209, height: 1568 });
    expect(fitWithin(800, 600, MAX_EDGE)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(20_000, 10, MAX_EDGE)).toEqual({ width: 1568, height: 1 });
  });

  test("small images go as they are; big ones are redrawn, and a big GIF becomes a PNG", () => {
    expect(encodePlan("image/png", 800, 600, 120_000)).toEqual({ width: 800, height: 600, mediaType: "image/png", reencode: false });
    expect(encodePlan("image/jpeg", 4032, 3024, 3_000_000)).toEqual({ width: 1568, height: 1176, mediaType: "image/jpeg", reencode: true });
    expect(encodePlan("image/gif", 2000, 1000, 900_000)).toEqual({ width: 1568, height: 784, mediaType: "image/png", reencode: true });
    expect(encodePlan("image/png", 1500, 1500, 6_000_000).reencode).toBe(true);
  });

  test("admits up to four supported images and says why the rest were left out", () => {
    const png = { type: "image/png" };
    expect(admitFiles([png, png, png, png, png], 0)).toEqual({ accepted: [png, png, png, png], error: IMAGE_ERRORS.count });
    expect(admitFiles([png], 4)).toEqual({ accepted: [], error: IMAGE_ERRORS.count });
    const heic = { type: "image/heic" };
    expect(admitFiles([heic, png], 0)).toEqual({ accepted: [png], error: IMAGE_ERRORS.type });
    expect(admitFiles([{ type: "application/pdf" }], 0)).toEqual({ accepted: [], error: IMAGE_ERRORS.type });
    expect(admitFiles([png, png], 2)).toEqual({ accepted: [png, png], error: null });
  });
});
