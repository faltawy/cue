import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareVersions, InstalledClaudeCodeFinder, isNativeExecutable, parseClaudeVersion } from "./installed-claude-code";

const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "coach-installed-claude-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const MACH_O = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]);

function place(dir: string, contents: Buffer | string): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "claude");
  writeFileSync(file, contents);
  chmodSync(file, 0o755);
  return file;
}

function finder(home: string, searchPath: string[], versions: Record<string, string>, cacheFile?: string) {
  const asked: string[] = [];
  const instance = new InstalledClaudeCodeFinder({
    home,
    platform: "darwin",
    systemDirectories: [],
    searchPath: async () => searchPath,
    versionOf: async (file) => {
      asked.push(file);
      const version = versions[file];
      if (!version) throw new Error(`no version for ${file}`);
      return `${version} (Claude Code)`;
    },
    ...(cacheFile ? { cacheFile } : {}),
  });
  return { instance, asked };
}

describe("compareVersions / parseClaudeVersion", () => {
  test("compares numerically, not as text", () => {
    expect(compareVersions("2.1.302", "2.1.99")).toBeGreaterThan(0);
    expect(compareVersions("2.0.400", "2.1.0")).toBeLessThan(0);
    expect(compareVersions("2.1.302", "2.1.302")).toBe(0);
  });

  test("reads the version out of `claude --version`", () => {
    expect(parseClaudeVersion("2.1.302 (Claude Code)\n")).toBe("2.1.302");
    expect(parseClaudeVersion("command not found")).toBeUndefined();
  });
});

describe("isNativeExecutable", () => {
  test("a Mach-O file is native; an npm launcher script is not", async () => {
    const dir = path.join(root, "native-check");
    const native = place(path.join(dir, "a"), MACH_O);
    const script = place(path.join(dir, "b"), "#!/usr/bin/env node\nrequire('./cli.js')\n");
    expect(await isNativeExecutable(native)).toBe(true);
    expect(await isNativeExecutable(script)).toBe(false);
  });
});

describe("InstalledClaudeCodeFinder", () => {
  test("takes the newest native install across PATH and the usual install locations, skipping npm installs", async () => {
    const home = path.join(root, "home-newest");
    const local = place(path.join(home, ".local/bin"), MACH_O);
    const onPath = place(path.join(root, "path-old/bin"), MACH_O);
    const npm = place(path.join(root, "npm/bin"), "#!/usr/bin/env node\n");
    const { instance, asked } = finder(home, [path.dirname(onPath), path.dirname(npm), "relative/bin"], {
      [local]: "2.1.310",
      [onPath]: "2.1.200",
      [npm]: "9.9.9",
    });
    const found = await instance.find();
    expect(found).toEqual({ executablePath: local, commandPath: local, version: "2.1.310" });
    expect(asked).not.toContain(npm);
    expect(asked).toContain(onPath);
  });

  test("runs the resolved file but updates through the command that was found", async () => {
    const home = path.join(root, "home-symlink");
    const versioned = place(path.join(home, ".local/share/claude/versions/2.1.320"), MACH_O);
    mkdirSync(path.join(home, ".local/bin"), { recursive: true });
    const link = path.join(home, ".local/bin/claude");
    symlinkSync(versioned, link);
    const { instance } = finder(home, [], { [versioned]: "2.1.320" });
    expect(await instance.find()).toEqual({ executablePath: versioned, commandPath: link, version: "2.1.320" });
  });

  test("asks a file its version again only when the file changes, also across processes", async () => {
    const home = path.join(root, "home-cache");
    const file = place(path.join(home, ".local/bin"), MACH_O);
    const cacheFile = path.join(root, "versions-cache.json");
    const first = finder(home, [], { [file]: "2.1.300" }, cacheFile);
    expect((await first.instance.find())?.version).toBe("2.1.300");
    expect((await first.instance.find())?.version).toBe("2.1.300");
    expect(first.asked).toEqual([file]);

    const nextProcess = finder(home, [], { [file]: "2.1.300" }, cacheFile);
    expect((await nextProcess.instance.find())?.version).toBe("2.1.300");
    expect(nextProcess.asked).toEqual([]);

    utimesSync(file, new Date(), new Date(Date.now() + 60_000));
    const afterUpdate = finder(home, [], { [file]: "2.1.330" }, cacheFile);
    expect((await afterUpdate.instance.find())?.version).toBe("2.1.330");
    expect(afterUpdate.asked).toEqual([file]);
  });

  test("finds nothing when no claude is installed", async () => {
    const { instance } = finder(path.join(root, "home-empty"), [path.join(root, "nowhere")], {});
    expect(await instance.find()).toBeNull();
  });
});
