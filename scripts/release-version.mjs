import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function normalizeVersion(input) {
  const version = String(input ?? "").replace(/^v/, "");
  if (!SEMVER.test(version)) {
    throw new Error(
      `"${input}" is not a semantic version like 0.2.0 or 0.2.0-beta.1`,
    );
  }
  return version;
}

function stampJson(text, version) {
  const next = text.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`);
  if (JSON.parse(next).version !== version) {
    throw new Error('no top-level "version" field to stamp');
  }
  return next;
}

function stampCargo(text, version) {
  const next = text.replace(
    /(\[package\][^[]*?^version\s*=\s*)"[^"]*"/ms,
    `$1"${version}"`,
  );
  if (next === text && !text.includes(`version = "${version}"`)) {
    throw new Error("no [package] version to stamp");
  }
  return next;
}

function stampCargoLock(text, version) {
  const next = text.replace(
    /(^name = "desktop"\nversion = )"[^"]*"/m,
    `$1"${version}"`,
  );
  if (!/^name = "desktop"\nversion = /m.test(text)) {
    throw new Error("no desktop package in Cargo.lock to stamp");
  }
  return next;
}

export function setReleaseVersion(root, input) {
  const version = normalizeVersion(input);
  const files = [
    ["apps/desktop/src-tauri/tauri.conf.json", stampJson],
    ["apps/desktop/package.json", stampJson],
    ["apps/desktop/src-tauri/Cargo.toml", stampCargo],
    ["Cargo.lock", stampCargoLock],
  ].map(([path, stamp]) => {
    const full = join(root, path);
    return [full, stamp(readFileSync(full, "utf8"), version)];
  });
  for (const [full, text] of files) writeFileSync(full, text);
  return version;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    console.log(setReleaseVersion(root, process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
