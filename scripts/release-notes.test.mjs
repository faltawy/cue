import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readReleaseNotes, writeDesktopNotes } from "./release-notes.mjs";

const CHANGELOG = `# @anlg/desktop

## 0.2.0

### Minor Changes

- 1a2b3c4: The coach gives the wrap-up of the meeting you stopped. Thanks [@someone](https://github.com/someone)!

### Patch Changes

- [abcdef1](https://github.com/faltawy/cue/commit/abcdef1234567890) What's new shows Cue's own notes ([#42](https://github.com/faltawy/cue/pull/42))
- Faster start. See https://example.com/internal for details.

## 0.1.4

### Patch Changes

- Older note
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cue-release-notes-"));
  mkdirSync(join(root, "apps/desktop"), { recursive: true });
  mkdirSync(join(root, "packages/changelog/content/desktop"), {
    recursive: true,
  });
  writeFileSync(join(root, "apps/desktop/CHANGELOG.md"), CHANGELOG);
  return root;
}

test("writes the version's notes as plain bullets without hashes, links or names", () => {
  const root = fixture();

  const path = writeDesktopNotes(root, "0.2.0");

  assert.equal(path, join(root, "packages/changelog/content/desktop/0.2.0.md"));
  assert.equal(
    readFileSync(path, "utf8"),
    [
      "- The coach gives the wrap-up of the meeting you stopped.",
      "- What's new shows Cue's own notes",
      "- Faster start. See for details.",
      "",
    ].join("\n"),
  );
});

test("refuses a version the changelog has no section for", () => {
  const root = fixture();

  assert.throws(
    () => writeDesktopNotes(root, "0.3.0"),
    /no "## 0.3.0" section/,
  );
});

test("release notes come from the version's notes file and fail when it is missing", () => {
  const root = fixture();
  writeFileSync(
    join(root, "packages/changelog/content/desktop/0.2.0.md"),
    "- A fix\n",
  );

  assert.equal(readReleaseNotes(root, "v0.2.0"), "- A fix\n");
  assert.throws(
    () => readReleaseNotes(root, "v0.2.1"),
    /desktop\/0\.2\.1\.md is missing/,
  );
});
