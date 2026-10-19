import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildManifest } from "./release-manifest.mjs";

const URL = "https://api.github.com/repos/faltawy/cue/releases/assets/301";

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

test("CLI reads the .sig file and prints the manifest", () => {
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
      "--url",
      URL,
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
