import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { changelog } from "../apps/desktop/plugins/changelog.ts";

test("the app bundles only the notes for its own version", async (t) => {
  const previous = process.env.VITE_APP_VERSION;
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.VITE_APP_VERSION;
    else process.env.VITE_APP_VERSION = previous;
  });
  writeFileSync(join(dir, "0.1.0.md"), "Cue 0.1.0 notes");
  writeFileSync(join(dir, "1.4.9.md"), "Upstream 1.4.9 notes");
  const bundle = async (version) => {
    if (version === undefined) delete process.env.VITE_APP_VERSION;
    else process.env.VITE_APP_VERSION = version;
    return changelog(dir).load.call({}, "\0virtual:changelog");
  };

  const matching = await bundle("0.1.0");
  const missing = await bundle("0.1.1");
  const unversioned = await bundle(undefined);

  assert.ok(matching.includes('latestContent = "Cue 0.1.0 notes"'));
  assert.ok(missing.includes('latestVersion = "0.1.1"'));
  assert.ok(missing.includes("latestContent = null"));
  assert.ok(unversioned.includes("latestVersion = null"));
  assert.ok(unversioned.includes("latestContent = null"));
});
