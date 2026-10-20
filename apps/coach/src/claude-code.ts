import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sdkPackage from "@anthropic-ai/claude-agent-sdk/package.json" with { type: "json" };

import { CLAUDE_CODE_PIN } from "./claude-code-pin";
import { compareVersions, type InstalledClaudeCode, InstalledClaudeCodeFinder } from "./installed-claude-code";

/**
 * The Claude Code release the bundled Agent SDK ships with, read from the
 * SDK's package at build time: an installed Claude Code at this version or
 * newer runs instead of Cue's own copy, which is this version.
 */
export const CLAUDE_CODE_MIN_VERSION: string = sdkPackage.claudeCodeVersion;
export const CLAUDE_AGENT_SDK_VERSION: string = sdkPackage.version;

const REGISTRY_HOST = "registry.npmjs.org";
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;
const INTEGRITY_MARKER = ".integrity";
const INSTALL_LOCK = ".install.lock";
const LOCK_POLL_MS = 250;
const UNCLAIMED_LOCK_MS = 10_000;

export type ClaudeCodeArtifact = {
  /** The SDK platform package version, also the cache directory's name. */
  version: string;
  tarballUrl: string;
  integrity: `sha512-${string}`;
};

/** Which Claude Code the coach runs: the person's own, or Cue's pinned copy. */
export type ClaudeCodeStatus = {
  using: "installed" | "cue";
  /** The newest native Claude Code found on this Mac, if any. */
  installed: InstalledClaudeCode | null;
  /** The oldest installed version the coach runs; also Cue's copy's version. */
  minVersion: string;
};

export type ResolvedClaudeCode = { executablePath: string; source: "installed" | "cue" };

/** One tick of the first-use download, for "Setting up the coach… 45%". */
export type ClaudeCodeProgress = { receivedBytes: number; totalBytes: number };

/** The one-time download failed; trying again may work. */
export class ClaudeCodeSetupError extends Error {
  override readonly name = "ClaudeCodeSetupError";
}

export function platformTarget(): string {
  return `${process.platform}-${process.arch}`;
}

/** Cue's pinned copy for one platform, or null where none is pinned. */
export function pinnedArtifact(target = platformTarget()): ClaudeCodeArtifact | null {
  const integrity = Object.entries(CLAUDE_CODE_PIN.integrity).find(([key]) => key === target)?.[1];
  if (!integrity) return null;
  const { sdkVersion } = CLAUDE_CODE_PIN;
  return {
    version: sdkVersion,
    tarballUrl: `https://${REGISTRY_HOST}/@anthropic-ai/claude-agent-sdk-${target}/-/claude-agent-sdk-${target}-${sdkVersion}.tgz`,
    integrity,
  };
}

type ClaudeCodeOptions = {
  /** Where Cue's copy lives: the app's cache directory, never the bundle. */
  rootDir: string;
  finder: Pick<InstalledClaudeCodeFinder, "find" | "update">;
  artifact?: ClaudeCodeArtifact | null;
  minVersion?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Finds the Claude Code the coach runs: the person's own native install when
 * it is at least the SDK's version, else Cue's integrity-pinned copy,
 * downloaded once into the app's cache and reused offline after that.
 */
export class ClaudeCode {
  private readonly rootDir: string;
  private readonly finder: Pick<InstalledClaudeCodeFinder, "find" | "update">;
  private readonly artifact: ClaudeCodeArtifact | null;
  private readonly minVersion: string;
  private readonly fetchImpl: typeof fetch;
  private pending: Promise<ResolvedClaudeCode> | null = null;
  private readonly progressListeners = new Set<(progress: ClaudeCodeProgress) => void>();

  constructor(options: ClaudeCodeOptions) {
    this.rootDir = options.rootDir;
    this.finder = options.finder;
    this.artifact = options.artifact === undefined ? pinnedArtifact() : options.artifact;
    this.minVersion = options.minVersion ?? CLAUDE_CODE_MIN_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async status(): Promise<ClaudeCodeStatus> {
    const installed = await this.finder.find();
    return {
      using: installed && compareVersions(installed.version, this.minVersion) >= 0 ? "installed" : "cue",
      installed,
      minVersion: this.minVersion,
    };
  }

  /** Update the person's own Claude Code with its own updater, when they ask. */
  async updateInstalled(): Promise<{ output: string; status: ClaudeCodeStatus }> {
    const before = await this.status();
    if (!before.installed) throw new Error("Claude Code isn't installed on this Mac.");
    const output = await this.finder.update(before.installed).catch((error: unknown) => errorText(error));
    return { output, status: await this.status() };
  }

  /** Watch the first-use download; silent when Cue's copy is already here. */
  onProgress(listener: (progress: ClaudeCodeProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  async resolve(): Promise<ResolvedClaudeCode> {
    const status = await this.status();
    if (status.using === "installed" && status.installed) {
      return { executablePath: status.installed.executablePath, source: "installed" };
    }
    const artifact = this.artifact;
    if (!artifact) {
      throw new ClaudeCodeSetupError(
        `Claude Code isn't available for ${platformTarget()}. Install Claude Code ${this.minVersion} or newer to use the coach.`,
      );
    }
    const existing = await this.downloaded(artifact);
    if (existing) return existing;
    this.pending ??= this.install(artifact).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private componentDir(artifact: ClaudeCodeArtifact): string {
    return path.join(this.rootDir, artifact.version);
  }

  private executableIn(dir: string): ResolvedClaudeCode {
    return { executablePath: path.join(dir, "claude"), source: "cue" };
  }

  private async downloaded(artifact: ClaudeCodeArtifact): Promise<ResolvedClaudeCode | null> {
    const dir = this.componentDir(artifact);
    const resolved = this.executableIn(dir);
    const [marker, stat] = await Promise.all([
      fs.readFile(path.join(dir, INTEGRITY_MARKER), "utf8").catch(() => undefined),
      fs.stat(resolved.executablePath).catch(() => undefined),
    ]);
    return marker?.trim() === artifact.integrity && stat?.isFile() ? resolved : null;
  }

  private emit(progress: ClaudeCodeProgress) {
    for (const listener of this.progressListeners) listener(progress);
  }

  /**
   * One coach process downloads at a time: the others (sign-in checks,
   * summaries) wait for its copy instead of fetching their own.
   */
  private async install(artifact: ClaudeCodeArtifact): Promise<ResolvedClaudeCode> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const lock = path.join(this.rootDir, INSTALL_LOCK);
    for (;;) {
      const handle = await fs.open(lock, "wx", 0o600).catch((error: unknown) => {
        if (errorCode(error) === "EEXIST") return null;
        throw new ClaudeCodeSetupError(`The coach couldn't prepare Claude Code: ${errorText(error)}`, { cause: error });
      });
      if (handle) {
        try {
          await handle.writeFile(String(process.pid));
          await handle.close();
          return (await this.downloaded(artifact)) ?? (await this.download(artifact));
        } finally {
          await fs.rm(lock, { force: true });
        }
      }
      if (!(await lockHeld(lock))) {
        await fs.rm(lock, { force: true });
        continue;
      }
      await Bun.sleep(LOCK_POLL_MS);
      const installed = await this.downloaded(artifact);
      if (installed) return installed;
    }
  }

  private async download(artifact: ClaudeCodeArtifact): Promise<ResolvedClaudeCode> {
    const staging = await fs.mkdtemp(path.join(this.rootDir, ".install-"));
    const archive = path.join(staging, "claude.tgz");
    const payload = path.join(staging, "payload");
    const finalDir = this.componentDir(artifact);
    try {
      assertTrustedArtifact(artifact);
      const response = await this.fetchImpl(artifact.tarballUrl, { redirect: "error" });
      if (!response.ok || !response.body) throw new Error(`the download returned HTTP ${response.status}`);
      await writeVerifiedArchive(response, archive, artifact.integrity, (progress) => this.emit(progress));
      await fs.mkdir(payload);
      await extractExecutable(archive, payload);
      const executable = this.executableIn(payload).executablePath;
      if (!(await fs.stat(executable)).isFile()) throw new Error("the archive contains no executable");
      await fs.chmod(executable, 0o755);
      await fs.writeFile(path.join(payload, INTEGRITY_MARKER), `${artifact.integrity}\n`, { mode: 0o600 });
      const raced = await this.downloaded(artifact);
      if (raced) return raced;
      await fs.rm(finalDir, { recursive: true, force: true });
      await fs.rename(payload, finalDir).catch(async (error: unknown) => {
        if (!(await this.downloaded(artifact))) throw error;
      });
      await this.removeOtherVersions(artifact);
      console.error(`[coach] installed Claude Code from ${artifact.tarballUrl}`);
      return this.executableIn(finalDir);
    } catch (cause) {
      throw new ClaudeCodeSetupError(
        `The coach needs a one-time download of Claude Code. ${capitalize(errorText(cause))}. Check your internet connection and try again.`,
        { cause },
      );
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  /** Earlier pins' copies, and downloads a crashed run left behind. */
  private async removeOtherVersions(artifact: ClaudeCodeArtifact): Promise<void> {
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === artifact.version) continue;
      const full = path.join(this.rootDir, entry.name);
      if (entry.name.startsWith(".install-")) {
        const stat = await fs.stat(full).catch(() => undefined);
        if (!stat || Date.now() - stat.mtimeMs < STALE_STAGING_MS) continue;
      }
      await fs.rm(full, { recursive: true, force: true });
    }
  }
}

function assertTrustedArtifact(artifact: ClaudeCodeArtifact): void {
  const url = new URL(artifact.tarballUrl);
  if (url.protocol !== "https:" || url.hostname !== REGISTRY_HOST) {
    throw new Error(`refusing the untrusted download address ${url.origin}`);
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(artifact.integrity)) {
    throw new Error("the download has no valid SHA-512 integrity pin");
  }
}

async function writeVerifiedArchive(
  response: Response,
  destination: string,
  expected: `sha512-${string}`,
  onProgress: (progress: ClaudeCodeProgress) => void,
): Promise<void> {
  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error("the download is too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("the download has no body");
  const handle = await fs.open(destination, "wx", 0o600);
  const hash = createHash("sha512");
  let receivedBytes = 0;
  let lastTick = 0;
  onProgress({ receivedBytes, totalBytes });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_ARCHIVE_BYTES) throw new Error("the download is too large");
      hash.update(value);
      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
        offset += bytesWritten;
      }
      if (Date.now() - lastTick >= 200) {
        lastTick = Date.now();
        onProgress({ receivedBytes, totalBytes });
      }
    }
    onProgress({ receivedBytes, totalBytes });
  } finally {
    await handle.close();
  }
  if (`sha512-${hash.digest("base64")}` !== expected) throw new Error("the download's integrity verification failed");
}

async function extractExecutable(archive: string, destination: string): Promise<void> {
  const tar = Bun.spawn(["tar", "-xzf", archive, "-C", destination, "--strip-components", "1", "package/claude"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(tar.stderr).text(), tar.exited]);
  if (exitCode !== 0) throw new Error(`couldn't unpack the download: ${stderr.trim() || `tar exited ${exitCode}`}`);
}

/** Whether the process that wrote the lock is still running. */
async function lockHeld(lock: string): Promise<boolean> {
  const [text, stat] = await Promise.all([
    fs.readFile(lock, "utf8").catch(() => undefined),
    fs.stat(lock).catch(() => undefined),
  ]);
  if (text === undefined || !stat) return false;
  const pid = Number(text.trim());
  if (!Number.isInteger(pid) || pid <= 0) return Date.now() - stat.mtimeMs < UNCLAIMED_LOCK_MS;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The app passes its cache directory; the CLI falls back to the dev app's. */
export const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), "Library/Caches/com.hyprnote.dev/claude-code");

/**
 * The Claude Code for a coach process: an explicit `--claude` path as is,
 * else the person's own install or Cue's copy under `--claude-dir`.
 */
export function claudeCodeFromArgs(values: { claude?: string; "claude-dir"?: string }): {
  claudeCode: ClaudeCode;
  executable: () => Promise<string>;
} {
  const rootDir = path.resolve(values["claude-dir"] ?? DEFAULT_CLAUDE_DIR);
  const claudeCode = new ClaudeCode({
    rootDir,
    finder: new InstalledClaudeCodeFinder({ cacheFile: path.join(rootDir, "installed-versions.json") }),
  });
  const explicit = values.claude ? path.resolve(values.claude) : undefined;
  return {
    claudeCode,
    executable: async () => explicit ?? (await claudeCode.resolve()).executablePath,
  };
}

export const CLAUDE_ARGS = {
  claude: { type: "string" },
  "claude-dir": { type: "string" },
} as const;
