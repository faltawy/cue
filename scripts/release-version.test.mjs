import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setReleaseVersion } from "./release-version.mjs";

const TAURI_CONF = `{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Cue Dev",
  "version": "0.1.0",
  "build": {
    "features": ["direct-distribution"]
  },
  "plugins": {
    "updater": { "version": "not-me" }
  }
}
`;

const PACKAGE_JSON = `{
  "name": "@anlg/desktop",
  "version": "0.1.0",
  "dependencies": {
    "left-pad": "1.3.0"
  }
}
`;

const CARGO_TOML = `[package]
name = "desktop"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1.0.1", features = ["derive"] }
`;

const CARGO_LOCK = `[[package]]
name = "desktop"
version = "0.1.0"
dependencies = [
 "serde",
]

[[package]]
name = "desktop-helper"
version = "0.1.0"
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cue-release-version-"));
  mkdirSync(join(root, "apps/desktop/src-tauri"), { recursive: true });
  writeFileSync(
    join(root, "apps/desktop/src-tauri/tauri.conf.json"),
    TAURI_CONF,
  );
  writeFileSync(join(root, "apps/desktop/package.json"), PACKAGE_JSON);
  writeFileSync(join(root, "apps/desktop/src-tauri/Cargo.toml"), CARGO_TOML);
  writeFileSync(join(root, "Cargo.lock"), CARGO_LOCK);
  return {
    root,
    read: (path) => readFileSync(join(root, path), "utf8"),
  };
}

test("stamps the app version into tauri.conf, package.json, Cargo.toml and Cargo.lock only", () => {
  const { root, read } = fixture();

  setReleaseVersion(root, "v0.2.0");

  assert.equal(
    read("apps/desktop/src-tauri/tauri.conf.json"),
    TAURI_CONF.replace('"version": "0.1.0"', '"version": "0.2.0"'),
  );
  assert.equal(
    read("apps/desktop/package.json"),
    PACKAGE_JSON.replace('"version": "0.1.0"', '"version": "0.2.0"'),
  );
  assert.equal(
    read("apps/desktop/src-tauri/Cargo.toml"),
    CARGO_TOML.replace('version = "0.1.0"', 'version = "0.2.0"'),
  );
  assert.equal(
    read("Cargo.lock"),
    CARGO_LOCK.replace(
      'name = "desktop"\nversion = "0.1.0"',
      'name = "desktop"\nversion = "0.2.0"',
    ),
  );
});

test("accepts a prerelease version for beta builds", () => {
  const { root, read } = fixture();

  setReleaseVersion(root, "0.3.0-beta.2");

  assert.equal(
    JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json")).version,
    "0.3.0-beta.2",
  );
  assert.match(
    read("apps/desktop/src-tauri/Cargo.toml"),
    /^version = "0\.3\.0-beta\.2"$/m,
  );
});

test("rejects a version that is not semver and leaves files untouched", () => {
  const { root, read } = fixture();

  for (const bad of ["0.2", "latest", "v1.2.3.4", ""]) {
    assert.throws(() => setReleaseVersion(root, bad), /not a semantic version/);
  }
  assert.equal(read("apps/desktop/src-tauri/tauri.conf.json"), TAURI_CONF);
  assert.equal(read("apps/desktop/package.json"), PACKAGE_JSON);
  assert.equal(read("apps/desktop/src-tauri/Cargo.toml"), CARGO_TOML);
  assert.equal(read("Cargo.lock"), CARGO_LOCK);
});
