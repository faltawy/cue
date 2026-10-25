import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CODEX_HOME } from "./codex-session";

export enum CodexCodeSource {
  Cue = "cue",
}

export const CODEX_VERSION = "0.160.0";
const RELEASES = {
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    integrity:
      "sha512-aefV6cqZA2REZgR//4McyXlp7zLcTti4CI2v3j9IVgNndPBv2kCeNEcz07qeelXcwOdSFPUKb6roA48vZmDgrQ==",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    integrity:
      "sha512-ir7cdsPrb9VkqNqpTECoTiomv04xws/FQ968mHQzuL+2J5Da0Dkh2Qlxp7sguDDZJab4YpYmNjQvBVMXbTeQaQ==",
  },
};
const MAX_BYTES = 512 * 1024 * 1024;

export class CodexSetupError extends Error {
  override readonly name = "CodexSetupError";
}

export class CodexCode {
  private listeners = new Set<
    (progress: { receivedBytes: number; totalBytes: number }) => void
  >();
  private pending?: Promise<{
    executablePath: string;
    source: CodexCodeSource.Cue;
  }>;

  constructor(
    private readonly rootDir: string,
    private readonly options: {
      artifact?: {
        target: string;
        integrity: string;
        version: string;
        tarballUrl: string;
      };
      fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    } = {},
  ) {}

  onProgress(
    listener: (progress: { receivedBytes: number; totalBytes: number }) => void,
  ) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  resolve() {
    this.pending ??= this.install().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async install(): Promise<{
    executablePath: string;
    source: CodexCodeSource.Cue;
  }> {
    const platform = `${process.platform}-${process.arch}`;
    const release =
      this.options.artifact ??
      Object.entries(RELEASES).find(([key]) => key === platform)?.[1];
    if (!release)
      throw new CodexSetupError(`Codex is unavailable for ${platform}.`);
    const version = this.options.artifact?.version ?? CODEX_VERSION;
    const destination = path.join(this.rootDir, version);
    const executablePath = path.join(destination, "codex");
    const existing = async () =>
      (await fs
        .readFile(path.join(destination, ".integrity"), "utf8")
        .catch(() => "")) === release.integrity &&
      (await fs.stat(executablePath).catch(() => null))?.isFile() &&
      (
        await fs
          .stat(path.join(destination, "codex-code-mode-host"))
          .catch(() => null)
      )?.isFile();
    if (await existing())
      return { executablePath, source: CodexCodeSource.Cue };
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const staging = await fs.mkdtemp(path.join(this.rootDir, ".install-"));
    try {
      const url =
        this.options.artifact?.tarballUrl ??
        `https://registry.npmjs.org/@openai/codex/-/codex-${version}-${platform}.tgz`;
      const address = new URL(url);
      if (
        address.protocol !== "https:" ||
        address.hostname !== "registry.npmjs.org"
      )
        throw new Error("Untrusted Codex download address.");
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        redirect: "error",
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok || !response.body)
        throw new Error(`The download returned HTTP ${response.status}.`);
      const totalBytes = Number(response.headers.get("content-length")) || 0;
      if (totalBytes > MAX_BYTES) throw new Error("The download is too large.");
      const archive = path.join(staging, "codex.tgz");
      const handle = await fs.open(archive, "wx", 0o600);
      const hash = createHash("sha512");
      const reader = response.body.getReader();
      let receivedBytes = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > MAX_BYTES)
            throw new Error("The download is too large.");
          hash.update(value);
          let offset = 0;
          while (offset < value.byteLength)
            offset += (
              await handle.write(value, offset, value.byteLength - offset)
            ).bytesWritten;
          for (const listener of this.listeners)
            listener({ receivedBytes, totalBytes });
        }
      } finally {
        await handle.close();
        await reader.cancel();
      }
      if (`sha512-${hash.digest("base64")}` !== release.integrity)
        throw new Error("The Codex download failed integrity verification.");
      const payload = path.join(staging, "payload");
      await fs.mkdir(payload);
      const members = ["codex", "codex-code-mode-host"].map(
        (name) => `package/vendor/${release.target}/bin/${name}`,
      );
      const tar = Bun.spawn(
        [
          "/usr/bin/tar",
          "-xzf",
          archive,
          "-C",
          payload,
          "--strip-components",
          "4",
          ...members,
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      const [stderr, code] = await Promise.all([
        new Response(tar.stderr).text(),
        tar.exited,
      ]);
      if (code !== 0) throw new Error(`Could not unpack Codex: ${stderr}`);
      for (const name of ["codex", "codex-code-mode-host"]) {
        const binary = path.join(payload, name);
        if (!(await fs.stat(binary)).isFile())
          throw new Error(`The archive contains no ${name} executable.`);
        await fs.chmod(binary, 0o755);
      }
      await fs.writeFile(path.join(payload, ".integrity"), release.integrity, {
        mode: 0o600,
      });
      // Unique staging directories plus an atomic rename let concurrent setup processes converge.
      await fs.rename(payload, destination).catch(async (error: unknown) => {
        if (await existing()) return;
        // A damaged cache must be repairable; quarantine it only after verifying its replacement.
        await fs
          .rename(destination, path.join(staging, "damaged"))
          .catch((moveError: unknown) => {
            if (
              !(
                moveError instanceof Error &&
                "code" in moveError &&
                moveError.code === "ENOENT"
              )
            )
              throw moveError;
          });
        await fs.rename(payload, destination).catch(async () => {
          if (!(await existing())) throw error;
        });
      });
      return { executablePath, source: CodexCodeSource.Cue };
    } catch (cause) {
      throw new CodexSetupError(
        `Cue could not set up Codex. ${cause instanceof Error ? cause.message : String(cause)} Try again.`,
        { cause },
      );
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}

export function codexCodeFromArgs(values: {
  codex?: string;
  "codex-dir"?: string;
}) {
  const root = path.resolve(
    values["codex-dir"] ?? path.dirname(DEFAULT_CODEX_HOME),
  );
  const codexCode = new CodexCode(root);
  return {
    codexCode,
    home: path.join(root, "account"),
    executable: async () =>
      values.codex
        ? path.resolve(values.codex)
        : (await codexCode.resolve()).executablePath,
  };
}

export const CODEX_ARGS = {
  codex: { type: "string" },
  "codex-dir": { type: "string" },
} as const;
