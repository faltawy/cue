import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { IMAGE_FILE_MAX_BYTES, imageHeaders, resolveImageFile } from "./files";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const base = realpathSync(mkdtempSync(path.join(tmpdir(), "coach-files-")));
const project = path.join(base, "northwind");
const knowledge = path.join(base, "playbooks");
const outside = path.join(base, "private");
for (const dir of [project, path.join(project, "docs"), knowledge, outside]) mkdirSync(dir, { recursive: true });
writeFileSync(path.join(project, "docs", "flow.png"), PNG);
writeFileSync(path.join(project, "docs", "Q3 board — diagram.JPG"), PNG);
writeFileSync(path.join(project, "docs", "arch.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
writeFileSync(path.join(project, ".env"), "SECRET=1");
writeFileSync(path.join(project, "notes.html"), "<script>alert(1)</script>");
writeFileSync(path.join(knowledge, "pricing.webp"), PNG);
writeFileSync(path.join(outside, "id.png"), PNG);
symlinkSync(path.join(outside, "id.png"), path.join(project, "docs", "escape.png"));
symlinkSync(outside, path.join(project, "linked"));
writeFileSync(path.join(project, "huge.gif"), Buffer.alloc(IMAGE_FILE_MAX_BYTES + 1));
const roots = [project, knowledge];

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("local images in answers", () => {
  test("a picture inside the meeting's folders is served with its image type", () => {
    expect(resolveImageFile("docs/flow.png", project, roots)).toEqual({ ok: true, file: path.join(project, "docs", "flow.png"), type: "image/png" });
    expect(resolveImageFile(path.join(project, "docs", "Q3 board — diagram.JPG"), project, roots)).toMatchObject({ ok: true, type: "image/jpeg" });
    expect(resolveImageFile(path.join(knowledge, "pricing.webp"), project, roots)).toMatchObject({ ok: true, type: "image/webp" });
    expect(resolveImageFile("./docs/../docs/flow.png", project, roots)).toMatchObject({ ok: true, type: "image/png" });
  });

  test("a project opened through a symlinked path (like /tmp on macOS) still serves its own images", () => {
    const alias = path.join(base, "alias");
    symlinkSync(project, alias);
    expect(resolveImageFile("docs/flow.png", alias, [alias])).toEqual({ ok: true, file: path.join(project, "docs", "flow.png"), type: "image/png" });
    expect(resolveImageFile("../private/id.png", alias, [alias])).toMatchObject({ ok: false, status: 403 });
  });

  test.each([
    ["a relative path that climbs out", "../private/id.png"],
    ["a deep climb out", "docs/../../private/id.png"],
    ["an absolute path outside", path.join(outside, "id.png")],
    ["a symlinked file that points outside", "docs/escape.png"],
    ["a symlinked folder that points outside", "linked/id.png"],
    ["a system path", "/etc/hosts.png"],
  ])("refuses %s", (_name, requested) => {
    expect(resolveImageFile(requested, project, roots)).toMatchObject({ ok: false, status: 403 });
  });

  test.each([
    ["dotenv", ".env"],
    ["an HTML page named in the path", "notes.html"],
    ["a missing file", "docs/missing.png"],
    ["an empty path", ""],
  ])("does not serve %s", (_name, requested) => {
    const result = resolveImageFile(requested, project, roots);
    expect(result.ok).toBe(false);
  });

  test("refuses images over the size cap", () => {
    expect(resolveImageFile("huge.gif", project, roots)).toMatchObject({ ok: false, status: 413 });
  });

  test("SVGs are served as images that can't run scripts, and nothing is sniffed into HTML", () => {
    expect(resolveImageFile("docs/arch.svg", project, roots)).toMatchObject({ ok: true, type: "image/svg+xml" });
    const headers = imageHeaders("image/svg+xml");
    expect(headers["content-type"]).toBe("image/svg+xml");
    expect(headers["content-security-policy"]).toContain("script-src 'none'");
    expect(headers["content-security-policy"]).toContain("sandbox");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
