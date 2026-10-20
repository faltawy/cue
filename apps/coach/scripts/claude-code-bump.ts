import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Moves Cue's Claude Code pins to a published Claude Agent SDK release
 * together: the SDK in package.json (and so the Claude Code version the
 * coach needs, read from the SDK at build time), the version Cue downloads,
 * and every platform's integrity. Then refreshes bun.lock.
 *
 *   bun scripts/claude-code-bump.ts [version] [--output <file>]
 */

const REGISTRY = "https://registry.npmjs.org";
const SDK = "@anthropic-ai/claude-agent-sdk";
const COACH = path.resolve(import.meta.dir, "..");
export const PACKAGE_JSON = path.join(COACH, "package.json");
export const PIN = path.join(COACH, "src/claude-code-pin.ts");

export type ClaudeCodeRelease = {
  sdkVersion: string;
  /** The Claude Code version that SDK release ships with. */
  cliVersion: string;
  /** Platform target ("darwin-arm64") → the platform package's integrity. */
  integrity: Record<string, `sha512-${string}`>;
};

const EXACT = /^\d+\.\d+\.\d+$/;

/** The SDK version package.json pins today. */
export function pinnedSdkVersion(packageJson: string): string {
  const manifest: { dependencies?: Record<string, string> } = JSON.parse(packageJson);
  const version = manifest.dependencies?.[SDK];
  if (!version || !EXACT.test(version)) throw new Error(`${SDK} must be pinned to an exact version`);
  return version;
}

/** Platform targets Cue downloads Claude Code for. */
export function pinTargets(pin: string): string[] {
  return [...pin.matchAll(/^ {4}"([a-z0-9]+-[a-z0-9]+)": "sha512-/gm)].map((match) => match[1] ?? "");
}

/** Rewrite package.json and the pin file for one release. */
export function applyRelease(
  files: { packageJson: string; pin: string },
  release: Pick<ClaudeCodeRelease, "sdkVersion" | "integrity">,
): { packageJson: string; pin: string } {
  const sdkPattern = new RegExp(`("${SDK.replace(/[/.-]/g, "\\$&")}": )"[^"]+"`);
  if (!sdkPattern.test(files.packageJson)) throw new Error(`package.json has no ${SDK} dependency`);
  const packageJson = files.packageJson.replace(sdkPattern, `$1"${release.sdkVersion}"`);
  const versionPattern = /(sdkVersion: )"[^"]+"/;
  if (!versionPattern.test(files.pin)) throw new Error("the pin file has no sdkVersion");
  let pin = files.pin.replace(versionPattern, `$1"${release.sdkVersion}"`);
  for (const target of pinTargets(files.pin)) {
    const integrity = release.integrity[target];
    if (!integrity) throw new Error(`No ${SDK} executable for ${target}`);
    pin = pin.replace(new RegExp(`(^ {4}"${target}": )"sha512-[^"]+"`, "m"), `$1"${integrity}"`);
  }
  return { packageJson, pin };
}

type RegistryVersion = { version: string; claudeCodeVersion?: unknown; dist?: { integrity?: unknown } };

function isRegistryVersion(value: unknown): value is RegistryVersion {
  return typeof value === "object" && value !== null && "version" in value && typeof value.version === "string";
}

async function registry(name: string, version: string): Promise<RegistryVersion> {
  const response = await fetch(`${REGISTRY}/${name}/${version}`);
  if (!response.ok) throw new Error(`${name}@${version}: the registry returned ${response.status}`);
  const manifest: unknown = await response.json();
  if (!isRegistryVersion(manifest)) throw new Error(`${name}@${version}: unexpected registry response`);
  return manifest;
}

/** One SDK release's metadata, straight from npm. */
export async function fetchRelease(version: string, targets: readonly string[]): Promise<ClaudeCodeRelease> {
  const sdk = await registry(SDK, version);
  const cliVersion = sdk.claudeCodeVersion;
  if (typeof cliVersion !== "string" || !EXACT.test(cliVersion)) {
    throw new Error(`${SDK}@${sdk.version} names no exact Claude Code version`);
  }
  const integrity: Record<string, `sha512-${string}`> = {};
  for (const target of targets) {
    const name = `${SDK}-${target}`;
    const value = (await registry(name, sdk.version)).dist?.integrity;
    if (typeof value !== "string" || !value.startsWith("sha512-")) {
      throw new Error(`${name}@${sdk.version} has no sha512 integrity`);
    }
    integrity[target] = `sha512-${value.slice("sha512-".length)}`;
  }
  return { sdkVersion: sdk.version, cliVersion, integrity };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputFlag = args.indexOf("--output");
  const output = outputFlag === -1 ? undefined : args[outputFlag + 1];
  const requested = args.find((arg, index) => !arg.startsWith("--") && index !== outputFlag + 1) ?? "latest";
  const files = { packageJson: readFileSync(PACKAGE_JSON, "utf8"), pin: readFileSync(PIN, "utf8") };
  const current = pinnedSdkVersion(files.packageJson);
  const release = await fetchRelease(requested, pinTargets(files.pin));
  if (release.sdkVersion === current) {
    console.log(`Claude Code is already pinned to SDK ${current}`);
    if (output) appendFileSync(output, "changed=false\n");
  } else {
    const next = applyRelease(files, release);
    writeFileSync(PACKAGE_JSON, next.packageJson);
    writeFileSync(PIN, next.pin);
    const install = Bun.spawnSync(["bun", "install"], { cwd: COACH, stdout: "inherit", stderr: "inherit" });
    if (install.exitCode !== 0) throw new Error(`bun install exited ${install.exitCode}`);
    console.log(`Claude Agent SDK ${current} → ${release.sdkVersion} (Claude Code ${release.cliVersion})`);
    if (output) {
      appendFileSync(output, `changed=true\nfrom=${current}\nsdk=${release.sdkVersion}\ncli=${release.cliVersion}\n`);
    }
  }
}
