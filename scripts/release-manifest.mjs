import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { normalizeVersion } from "./release-version.mjs";

export const UPDATER_TARGET = "darwin-aarch64";

export function buildManifest({ version, notes, pubDate, signature, url }) {
  const sig = String(signature ?? "").trim();
  if (!sig) throw new Error("the updater signature is empty");
  if (!/^https:\/\//.test(url ?? "")) {
    throw new Error(`the update URL must be https: ${url}`);
  }
  return {
    version: normalizeVersion(version),
    notes: String(notes ?? "").trim(),
    pub_date: pubDate.toISOString(),
    platforms: { [UPDATER_TARGET]: { signature: sig, url } },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        version: { type: "string" },
        "signature-file": { type: "string" },
        url: { type: "string" },
        "notes-file": { type: "string" },
        "pub-date": { type: "string" },
      },
    });
    const manifest = buildManifest({
      version: values.version,
      signature: readFileSync(values["signature-file"], "utf8"),
      url: values.url,
      notes: values["notes-file"]
        ? readFileSync(values["notes-file"], "utf8")
        : "",
      pubDate: values["pub-date"] ? new Date(values["pub-date"]) : new Date(),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
