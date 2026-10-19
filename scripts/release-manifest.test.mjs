import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildManifest } from "./release-manifest.mjs";

const URL =
  "https://github.com/faltawy/cue-releases/releases/download/v0.2.0/Cue_0.2.0_aarch64.app.tar.gz";

test("builds the Tauri static update manifest for Apple silicon", () => {
  assert.deepEqual(
    buildManifest({
      version: "v0.2.0",
      notes: "Fixes",
      pubDate: new Date("2026-10-19T12:00:00Z"),
      signature: "dW50cnVzdGVk\n",
      url: URL,
    }),
    {
      version: "0.2.0",
      notes: "Fixes",
      pub_date: "2026-10-19T12:00:00.000Z",
      platforms: {
        "darwin-aarch64": { signature: "dW50cnVzdGVk", url: URL },
      },
    },
  );
});

test("refuses a manifest the updater could not use", () => {
  const base = {
    version: "0.2.0",
    notes: "",
    pubDate: new Date("2026-10-19T12:00:00Z"),
    signature: "sig",
    url: URL,
  };

  assert.throws(
    () => buildManifest({ ...base, version: "next" }),
    /semantic version/,
  );
  assert.throws(
    () => buildManifest({ ...base, signature: " \n" }),
    /signature/,
  );
  assert.throws(
    () => buildManifest({ ...base, url: "http://api.github.com/x" }),
    /https/,
  );
});

test("CLI points the manifest at the public download URL of the asset", () => {
  const dir = mkdtempSync(join(tmpdir(), "cue-release-manifest-"));
  writeFileSync(join(dir, "Cue.app.tar.gz.sig"), "c2lnbmF0dXJl");
  writeFileSync(join(dir, "notes.md"), "Line one\nLine two\n");

  const output = execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new globalThis.URL("./release-manifest.mjs", import.meta.url),
      ),
      "--version",
      "0.2.0",
      "--signature-file",
      join(dir, "Cue.app.tar.gz.sig"),
      "--repo",
      "faltawy/cue-releases",
      "--tag",
      "v0.2.0",
      "--asset",
      "Cue_0.2.0_aarch64.app.tar.gz",
      "--notes-file",
      join(dir, "notes.md"),
      "--pub-date",
      "2026-10-19T12:00:00Z",
    ],
    { encoding: "utf8" },
  );

  assert.deepEqual(JSON.parse(output), {
    version: "0.2.0",
    notes: "Line one\nLine two",
    pub_date: "2026-10-19T12:00:00.000Z",
    platforms: {
      "darwin-aarch64": { signature: "c2lnbmF0dXJl", url: URL },
    },
  });
});

test("the app polls latest.json of the public repo releases go to", () => {
  const root = fileURLToPath(new globalThis.URL("..", import.meta.url));
  const workflow = readFileSync(
    join(root, ".github/workflows/release.yaml"),
    "utf8",
  );
  const conf = JSON.parse(
    readFileSync(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
  );

  assert.match(workflow, /^ {2}RELEASES_REPO: faltawy\/cue-releases$/m);
  assert.match(workflow, /gh release create "\$TAG" --repo "\$RELEASES_REPO"/);
  assert.deepEqual(conf.plugins.updater.endpoints, [
    "https://github.com/faltawy/cue-releases/releases/latest/download/latest.json",
  ]);
});
