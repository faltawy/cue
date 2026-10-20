import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { loginShellPath } from "./login-shell-path";

/** A Claude Code CLI the person installed themselves. */
export type InstalledClaudeCode = {
  /** The resolved executable, after symlinks: what the coach runs. */
  executablePath: string;
  /** Where it was found (`~/.local/bin/claude`): what updates run. */
  commandPath: string;
  version: string;
};

/** Numeric comparison of dotted versions: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** "2.1.302 (Claude Code)" → "2.1.302". */
export function parseClaudeVersion(output: string): string | undefined {
  return /\b(\d+\.\d+\.\d+)\b/.exec(output)?.[1];
}

const MACH_O_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

/**
 * Only a native executable runs without a Node on PATH: an app started
 * from the Dock does not inherit the shell's PATH, so a JavaScript `claude`
 * from a global npm install would fail to start under the SDK.
 */
export async function isNativeExecutable(file: string): Promise<boolean> {
  const handle = await fs.open(file, "r").catch(() => undefined);
  if (!handle) return false;
  try {
    const bytes = Buffer.alloc(4);
    const { bytesRead } = await handle.read(bytes, 0, 4, 0);
    if (bytesRead < 4) return false;
    const magic = bytes.readUInt32BE(0);
    return magic === 0x7f454c46 || MACH_O_MAGICS.has(magic);
  } finally {
    await handle.close();
  }
}

function run(file: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve(`${stdout}${stderr}`);
    });
  });
}

const versionCacheSchema = z.record(z.string(), z.object({ stamp: z.string(), version: z.string().nullable() }));
type VersionCache = z.infer<typeof versionCacheSchema>;

export type InstalledClaudeCodeFinderOptions = {
  home?: string;
  platform?: NodeJS.Platform;
  /** Install locations outside home; defaults to Homebrew's and /usr/local/bin. */
  systemDirectories?: string[];
  /** PATH entries to search, in order; defaults to this process's PATH and the login shell's. */
  searchPath?: () => Promise<string[]>;
  /** `claude --version` output for one executable. */
  versionOf?: (file: string) => Promise<string>;
  isNative?: (file: string) => Promise<boolean>;
  /** Where versions are remembered between runs, keyed by file and its size and mtime. */
  cacheFile?: string;
};

/**
 * Finds the person's own Claude Code, newest first. Each executable's
 * version is asked again only when the file changes (an update replaces it,
 * or moves the symlink to a new version), also across coach processes when
 * a cache file is given.
 */
export class InstalledClaudeCodeFinder {
  private readonly home: string;
  private readonly platform: NodeJS.Platform;
  private readonly systemDirectories: string[];
  private readonly searchPath: () => Promise<string[]>;
  private readonly versionOf: (file: string) => Promise<string>;
  private readonly isNative: (file: string) => Promise<boolean>;
  private readonly cacheFile: string | undefined;
  private versions: VersionCache | undefined;

  constructor(options: InstalledClaudeCodeFinderOptions = {}) {
    this.home = options.home ?? os.homedir();
    this.platform = options.platform ?? process.platform;
    this.systemDirectories = options.systemDirectories ?? ["/opt/homebrew/bin", "/usr/local/bin"];
    this.searchPath =
      options.searchPath ??
      (async () => [
        ...(process.env.PATH ?? "").split(path.delimiter),
        ...((await loginShellPath())?.split(path.delimiter) ?? []),
      ]);
    this.versionOf = options.versionOf ?? ((file) => run(file, ["--version"], 10_000));
    this.isNative = options.isNative ?? isNativeExecutable;
    this.cacheFile = options.cacheFile;
  }

  /** Where installers put `claude`, beyond whatever PATH says. */
  private knownDirectories(): string[] {
    return [path.join(this.home, ".local", "bin"), path.join(this.home, ".claude", "local"), ...this.systemDirectories];
  }

  /** The newest native Claude Code installed, whatever its version. */
  async find(): Promise<InstalledClaudeCode | null> {
    const name = this.platform === "win32" ? "claude.exe" : "claude";
    const directories = [...(await this.searchPath()), ...this.knownDirectories()].filter((entry) => path.isAbsolute(entry));
    const versions = await this.loadVersions();
    const before = JSON.stringify(versions);
    const seen = new Set<string>();
    let best: InstalledClaudeCode | null = null;
    for (const directory of directories) {
      const commandPath = path.join(directory, name);
      const resolved = await fs.realpath(commandPath).catch(() => undefined);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      const version = await this.versionAt(versions, resolved);
      if (version && (!best || compareVersions(version, best.version) > 0)) {
        best = { executablePath: resolved, commandPath, version };
      }
    }
    if (JSON.stringify(versions) !== before) await this.saveVersions(versions);
    return best;
  }

  private async versionAt(versions: VersionCache, file: string): Promise<string | undefined> {
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) return undefined;
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    const cached = versions[file];
    if (cached?.stamp === stamp) return cached.version ?? undefined;
    const version = (await this.isNative(file))
      ? await this.versionOf(file)
          .then(parseClaudeVersion)
          .catch(() => undefined)
      : undefined;
    versions[file] = { stamp, version: version ?? null };
    return version;
  }

  private async loadVersions(): Promise<VersionCache> {
    if (this.versions) return this.versions;
    let loaded: VersionCache = {};
    if (this.cacheFile) {
      const text = await fs.readFile(this.cacheFile, "utf8").catch(() => undefined);
      const parsed = text === undefined ? undefined : versionCacheSchema.safeParse(safeJson(text));
      if (parsed?.success) loaded = parsed.data;
    }
    this.versions = loaded;
    return loaded;
  }

  private async saveVersions(versions: VersionCache): Promise<void> {
    if (!this.cacheFile) return;
    try {
      await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
      const temp = `${this.cacheFile}.${process.pid}.tmp`;
      await fs.writeFile(temp, JSON.stringify(versions));
      await fs.rename(temp, this.cacheFile);
    } catch (error) {
      console.error("[coach] could not remember Claude Code versions", {
        _e: error instanceof Error ? error.message : String(error),
        cacheFile: this.cacheFile,
      });
    }
  }

  /**
   * Run the install's own updater (`claude update`) at the person's
   * request. Returns its output; the next find() sees the new version.
   */
  async update(installed: InstalledClaudeCode): Promise<string> {
    try {
      return await run(installed.commandPath, ["update"], 5 * 60_000);
    } finally {
      const versions = await this.loadVersions();
      delete versions[installed.executablePath];
      await this.saveVersions(versions);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
