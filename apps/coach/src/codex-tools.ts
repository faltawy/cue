import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { isInside } from "./guard";
import { tool } from "./runtime-tool";
import { text } from "./tool-result";

export function codexFileTools(
  roots: string[],
  protectedRoots: readonly string[],
) {
  async function permitted(target: string) {
    const real = await fs.realpath(path.resolve(roots[0] ?? ".", target));
    const allowed = await Promise.all(
      roots.map((root) => fs.realpath(root).catch(() => path.resolve(root))),
    );
    const blocked = await Promise.all(
      protectedRoots.map((root) =>
        fs.realpath(root).catch(() => path.resolve(root)),
      ),
    );
    if (
      !allowed.some((root) => isInside(root, real)) ||
      blocked.some((root) => isInside(root, real))
    ) {
      throw new Error(
        "That path is outside the allowed project folders or contains private app data.",
      );
    }
    return real;
  }
  async function files(target: string, limit: number): Promise<string[]> {
    const start = await permitted(target);
    if ((await fs.stat(start)).isFile()) return [start];
    const result: string[] = [];
    const pending = [start];
    let visited = 0;
    while (pending.length && result.length < limit && visited++ < 500) {
      const directory = pending.shift()!;
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        if (
          entry.isSymbolicLink() ||
          [".git", "node_modules", "target", ".codex", ".agents"].includes(
            entry.name,
          )
        )
          continue;
        const full = await permitted(path.join(directory, entry.name)).catch(
          () => null,
        );
        if (!full) continue;
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile()) result.push(full);
        if (result.length >= limit) break;
      }
    }
    return result;
  }
  async function read(file: string) {
    const real = await permitted(file);
    const handle = await fs.open(real, "r");
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Choose a file to read.");
      const buffer = Buffer.alloc(64_000);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (buffer.subarray(0, bytesRead).includes(0))
        throw new Error("This file is not text.");
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  }
  return [
    tool(
      "Read",
      "Read a text file within the user's project or reference folders (first 64 KB).",
      { file_path: z.string() },
      async ({ file_path }) => text(await read(file_path)),
    ),
    tool(
      "Glob",
      "List up to 200 files recursively in an allowed project folder. Hidden agent configuration, dependencies and private app data are excluded.",
      { path: z.string().default(".") },
      async ({ path: directory }) =>
        text((await files(directory, 200)).join("\n")),
    ),
    tool(
      "Grep",
      "Find literal text in project files. Returns up to 100 matching lines with file paths and line numbers; scans at most 200 files, first 64 KB each.",
      { path: z.string().default("."), pattern: z.string().min(1) },
      async ({ path: directory, pattern }) => {
        const matches: string[] = [];
        for (const file of await files(directory, 200)) {
          const content = await read(file).catch(() => "");
          for (const [index, line] of content.split("\n").entries()) {
            if (line.includes(pattern))
              matches.push(`${file}:${index + 1}:${line.slice(0, 500)}`);
            if (matches.length >= 100) return text(matches.join("\n"));
          }
        }
        return text(
          matches.join("\n") || "No matching text in the scanned files.",
        );
      },
    ),
  ];
}
