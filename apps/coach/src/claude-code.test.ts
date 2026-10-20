import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type ClaudeCodeArtifact, ClaudeCode, ClaudeCodeSetupError, pinnedArtifact } from "./claude-code";
import type { InstalledClaudeCode } from "./installed-claude-code";

const root = mkdtempSync(path.join(os.tmpdir(), "coach-claude-code-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const MIN = "2.1.302";
const PAYLOAD = "#!/bin/sh\necho 'cue copy'\n";

function tarball(): Buffer {
  const dir = mkdtempSync(path.join(root, "tarball-"));
  mkdirSync(path.join(dir, "package"));
  writeFileSync(path.join(dir, "package/claude"), PAYLOAD);
  writeFileSync(path.join(dir, "package/package.json"), "{}");
  const archive = path.join(dir, "out.tgz");
  const tar = Bun.spawnSync(["tar", "-czf", archive, "-C", dir, "package"]);
  if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
  return readFileSync(archive);
}

const archive = tarball();
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}` as const;
const artifact: ClaudeCodeArtifact = {
  version: "0.3.302",
  tarballUrl: "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-0.3.302.tgz",
  integrity,
};

function installed(version: string): InstalledClaudeCode {
  return { executablePath: `/home/me/.local/share/claude/versions/${version}`, commandPath: "/home/me/.local/bin/claude", version };
}

function serving(body: Buffer | (() => Response)) {
  const requests: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), redirect: init?.redirect });
    if (typeof body === "function") return body();
    return new Response(new Uint8Array(body), { headers: { "content-length": String(body.byteLength) } });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function claudeCode(options: { found?: InstalledClaudeCode | null; fetchImpl: typeof fetch; dir?: string; artifact?: ClaudeCodeArtifact | null }) {
  const updates: InstalledClaudeCode[] = [];
  const instance = new ClaudeCode({
    rootDir: options.dir ?? mkdtempSync(path.join(root, "store-")),
    minVersion: MIN,
    artifact: options.artifact === undefined ? artifact : options.artifact,
    fetchImpl: options.fetchImpl,
    finder: {
      find: async () => options.found ?? null,
      update: async (install) => {
        updates.push(install);
        return "Successfully updated";
      },
    },
  });
  return { instance, updates };
}

describe("ClaudeCode.resolve", () => {
  test("runs the person's own Claude Code when it is at least the SDK's version, downloading nothing", async () => {
    const { fetchImpl, requests } = serving(archive);
    const { instance } = claudeCode({ found: installed("2.1.310"), fetchImpl });
    expect(await instance.resolve()).toEqual({ executablePath: installed("2.1.310").executablePath, source: "installed" });
    expect(await instance.status()).toEqual({ using: "installed", installed: installed("2.1.310"), minVersion: MIN });
    expect(requests).toEqual([]);
  });

  test("an install older than the SDK's version falls back to Cue's pinned copy", async () => {
    const { fetchImpl, requests } = serving(archive);
    const dir = mkdtempSync(path.join(root, "store-"));
    const { instance } = claudeCode({ found: installed("2.1.250"), fetchImpl, dir });
    const resolved = await instance.resolve();
    expect(resolved).toEqual({ executablePath: path.join(dir, "0.3.302", "claude"), source: "cue" });
    expect(readFileSync(resolved.executablePath, "utf8")).toBe(PAYLOAD);
    expect(await instance.status()).toEqual({ using: "cue", installed: installed("2.1.250"), minVersion: MIN });
    expect(requests).toEqual([{ url: artifact.tarballUrl, redirect: "error" }]);
  });

  test("with nothing installed it downloads the pin once, then reuses it offline", async () => {
    const dir = mkdtempSync(path.join(root, "store-"));
    const online = serving(archive);
    const progress: number[] = [];
    const first = claudeCode({ fetchImpl: online.fetchImpl, dir });
    first.instance.onProgress((tick) => progress.push(tick.receivedBytes));
    const resolved = await first.instance.resolve();
    expect(resolved.source).toBe("cue");
    expect(progress.at(-1)).toBe(archive.byteLength);
    expect(readdirSync(dir)).toEqual(["0.3.302"]);

    const offline = serving(() => {
      throw new TypeError("fetch failed");
    });
    const later = claudeCode({ fetchImpl: offline.fetchImpl, dir });
    expect(await later.instance.resolve()).toEqual(resolved);
    expect(offline.requests).toEqual([]);
  });

  test("concurrent callers share one download", async () => {
    const { fetchImpl, requests } = serving(archive);
    const { instance } = claudeCode({ fetchImpl });
    const [a, b] = await Promise.all([instance.resolve(), instance.resolve()]);
    expect(a).toEqual(b);
    expect(requests).toHaveLength(1);
  });

  test("another coach process mid-download is waited for instead of downloading twice", async () => {
    const dir = mkdtempSync(path.join(root, "store-"));
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = serving(archive);
    const first = claudeCode({
      dir,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        await gate;
        return slow.fetchImpl(input, init);
      }) as typeof fetch,
    });
    const second = serving(archive);
    const other = claudeCode({ dir, fetchImpl: second.fetchImpl });

    const downloading = first.instance.resolve();
    await Bun.sleep(50);
    const waiting = other.instance.resolve();
    await Bun.sleep(300);
    release();
    expect(await waiting).toEqual(await downloading);
    expect(slow.requests).toHaveLength(1);
    expect(second.requests).toEqual([]);
  });

  test("while another process downloads, a waiter reports that download's progress", async () => {
    const dir = mkdtempSync(path.join(root, "store-"));
    writeFileSync(path.join(dir, ".install.lock"), String(process.pid));
    writeFileSync(path.join(dir, ".install.progress"), JSON.stringify({ receivedBytes: 45, totalBytes: 100 }));
    const { fetchImpl } = serving(archive);
    const { instance } = claudeCode({ dir, fetchImpl });
    const progress: Array<{ receivedBytes: number; totalBytes: number }> = [];
    instance.onProgress((tick) => progress.push(tick));
    const resolving = instance.resolve();
    await Bun.sleep(400);
    expect(progress).toContainEqual({ receivedBytes: 45, totalBytes: 100 });
    rmSync(path.join(dir, ".install.lock"));
    expect((await resolving).source).toBe("cue");
  });

  test("the downloading process shares its progress with other processes, and clears it when done", async () => {
    const dir = mkdtempSync(path.join(root, "store-"));
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chunk = Math.ceil(archive.byteLength / 2);
    const { instance } = claudeCode({
      dir,
      fetchImpl: serving(() =>
        new Response(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(new Uint8Array(archive.subarray(0, chunk)));
              await gate;
              controller.enqueue(new Uint8Array(archive.subarray(chunk)));
              controller.close();
            },
          }),
          { headers: { "content-length": String(archive.byteLength) } },
        ),
      ).fetchImpl,
    });
    const resolving = instance.resolve();
    await Bun.sleep(300);
    expect(JSON.parse(readFileSync(path.join(dir, ".install.progress"), "utf8"))).toEqual({
      receivedBytes: chunk,
      totalBytes: archive.byteLength,
    });
    release();
    await resolving;
    expect(existsSync(path.join(dir, ".install.progress"))).toBe(false);
  });

  test("a lock left by a process that died doesn't block the download", async () => {
    const dir = mkdtempSync(path.join(root, "store-"));
    const dead = Bun.spawnSync(["true"]).pid;
    writeFileSync(path.join(dir, ".install.lock"), String(dead));
    const { fetchImpl, requests } = serving(archive);
    const { instance } = claudeCode({ dir, fetchImpl });
    expect((await instance.resolve()).source).toBe("cue");
    expect(requests).toHaveLength(1);
    expect(existsSync(path.join(dir, ".install.lock"))).toBe(false);
  });

  test("an archive whose integrity doesn't match is refused and leaves nothing installed", async () => {
    const tampered = Buffer.from(archive);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0xff;
    const dir = mkdtempSync(path.join(root, "store-"));
    const { instance } = claudeCode({ fetchImpl: serving(tampered).fetchImpl, dir });
    const failure = await instance.resolve().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ClaudeCodeSetupError);
    expect(String(failure)).toContain("integrity verification failed");
    expect(existsSync(path.join(dir, "0.3.302"))).toBe(false);
    expect(readdirSync(dir).filter((entry) => entry.startsWith(".install-"))).toEqual([]);
  });

  test("a failed download is a retryable error, and the retry installs", async () => {
    let online = false;
    const { fetchImpl, requests } = serving(() =>
      online ? new Response(new Uint8Array(archive)) : new Response("unavailable", { status: 503 }),
    );
    const { instance } = claudeCode({ fetchImpl });
    const failure = await instance.resolve().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ClaudeCodeSetupError);
    expect(String(failure)).toContain("HTTP 503");
    expect(String(failure)).toContain("Check your internet connection and try again.");

    online = true;
    expect((await instance.resolve()).source).toBe("cue");
    expect(requests).toHaveLength(2);
  });

  test("refuses to download from anywhere but the npm registry", async () => {
    const { fetchImpl, requests } = serving(archive);
    const { instance } = claudeCode({
      fetchImpl,
      artifact: { ...artifact, tarballUrl: "https://example.com/claude.tgz" },
    });
    await expect(instance.resolve()).rejects.toThrow("untrusted");
    expect(requests).toEqual([]);
  });

  test("a platform with no pin and no qualifying install says so", async () => {
    const { instance } = claudeCode({ fetchImpl: serving(archive).fetchImpl, artifact: null, found: installed("2.1.1") });
    await expect(instance.resolve()).rejects.toThrow("isn't available");
  });
});

describe("ClaudeCode.updateInstalled", () => {
  test("runs the install's own updater and reports the new status", async () => {
    const { instance, updates } = claudeCode({ found: installed("2.1.250"), fetchImpl: serving(archive).fetchImpl });
    const result = await instance.updateInstalled();
    expect(updates).toEqual([installed("2.1.250")]);
    expect(result.output).toBe("Successfully updated");
  });

  test("with nothing installed there is nothing to update", async () => {
    const { instance, updates } = claudeCode({ fetchImpl: serving(archive).fetchImpl });
    await expect(instance.updateInstalled()).rejects.toThrow("isn't installed");
    expect(updates).toEqual([]);
  });
});

describe("pinnedArtifact", () => {
  test("pins macOS downloads to the npm registry tarball for the SDK's own platform package", () => {
    const pinned = pinnedArtifact("darwin-arm64");
    expect(pinned?.tarballUrl).toBe(
      `https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-darwin-arm64/-/claude-agent-sdk-darwin-arm64-${pinned?.version}.tgz`,
    );
    expect(pinned?.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
    expect(pinnedArtifact("plan9-mips")).toBeNull();
  });
});
