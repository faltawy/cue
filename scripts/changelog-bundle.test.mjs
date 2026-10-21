import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { changelog } from "../apps/desktop/plugins/changelog.ts";

test("the app bundles current and historical release notes", async (t) => {
  const previous = process.env.VITE_APP_VERSION;
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.VITE_APP_VERSION;
    else process.env.VITE_APP_VERSION = previous;
  });
  writeFileSync(join(dir, "0.1.0.md"), "Cue 0.1.0 notes");
  writeFileSync(join(dir, "0.2.0.md"), "Cue 0.2.0 notes");
  writeFileSync(join(dir, "draft.md"), "Unreleased notes");
  const bundle = async (version) => {
    if (version === undefined) delete process.env.VITE_APP_VERSION;
    else process.env.VITE_APP_VERSION = version;
    return changelog(dir).load.call({}, "\0virtual:changelog");
  };

  const source = await bundle(undefined);
  const loaded = await import(
    `data:text/javascript,${encodeURIComponent(source)}`
  );

  assert.equal(loaded.changelogs["0.1.0"], "Cue 0.1.0 notes");
  assert.equal(loaded.changelogs["0.2.0"], "Cue 0.2.0 notes");
  assert.equal(Object.hasOwn(loaded.changelogs, "draft"), false);
});
