import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizeVersion, setReleaseVersion } from "./release-version.mjs";

const CHANGELOG = "apps/desktop/CHANGELOG.md";
const NOTES_DIR = "packages/changelog/content/desktop";

export function notesPath(root, version) {
  return join(root, NOTES_DIR, `${normalizeVersion(version)}.md`);
}

export function extractSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

export function cleanNotes(section) {
  return section
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .map((line) =>
      line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/<?https?:\/\/[^\s>]+>?/g, "")
        .replace(/\s*Thanks\s+@[\w-]+!?/gi, "")
        .replace(/\(?#\d+\)?/g, "")
        .replace(
          /\[?\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b\]?:?/g,
          "",
        )
        .replace(/^(\s*)-\s+/, "$1- ")
        .replace(/(\S) {2,}/g, "$1 ")
        .replace(/\s+([.,;:!])/g, "$1")
        .trimEnd(),
    )
    .filter((line) => line.trim())
    .join("\n");
}

export function writeDesktopNotes(root, version) {
  const changelog = readFileSync(join(root, CHANGELOG), "utf8");
  const section = extractSection(changelog, version);
  if (section === null) {
    throw new Error(`${CHANGELOG} has no "## ${version}" section`);
  }
  const notes = cleanNotes(section);
  if (!/^- \S/m.test(notes)) {
    throw new Error(`${CHANGELOG} section ${version} has no release notes`);
  }
  const path = notesPath(root, version);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${notes}\n`);
  return path;
}

export function syncReleaseVersion(root) {
  const { version } = JSON.parse(
    readFileSync(join(root, "apps/desktop/package.json"), "utf8"),
  );
  setReleaseVersion(root, version);
  writeDesktopNotes(root, version);
  return version;
}

export function readReleaseNotes(root, tag) {
  const version = normalizeVersion(tag);
  const path = notesPath(root, version);
  if (!existsSync(path)) {
    throw new Error(
      `${NOTES_DIR}/${version}.md is missing. Run pnpm release:version and commit it before tagging v${version}.`,
    );
  }
  const notes = readFileSync(path, "utf8").trim();
  if (!notes) throw new Error(`${NOTES_DIR}/${version}.md is empty`);
  return `${notes}\n`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const [command, arg] = process.argv.slice(2);
  try {
    if (command === "version") {
      console.log(syncReleaseVersion(root));
    } else if (command === "release") {
      process.stdout.write(readReleaseNotes(root, arg));
    } else {
      throw new Error(
        "usage: release-notes.mjs version | release-notes.mjs release <tag>",
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
