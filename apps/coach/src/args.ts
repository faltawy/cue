import os from "node:os";
import path from "node:path";

import { expandProtectedRoots } from "./guard";
import { loadMcpConfig } from "./mcp-config";
import { type CoachOptions } from "./session";
import { openAppDb } from "./transcript";

const DEFAULT_DB = path.join(os.homedir(), "Library/Application Support/com.hyprnote.dev/app.db");

export const COACH_ARGS = {
  project: { type: "string" },
  dir: { type: "string", multiple: true },
  db: { type: "string", default: DEFAULT_DB },
  session: { type: "string" },
  model: { type: "string", default: "sonnet" },
  claude: { type: "string" },
  "mcp-config": { type: "string" },
  "allow-changes": { type: "string" },
  instructions: { type: "string" },
  knowledge: { type: "string", multiple: true },
  web: { type: "boolean", default: false },
  protect: { type: "string", multiple: true },
} as const;

export type CoachArgValues = {
  project?: string;
  dir?: string[];
  db: string;
  session?: string;
  model: string;
  claude?: string;
  "mcp-config"?: string;
  "allow-changes"?: string;
  instructions?: string;
  knowledge?: string[];
  web?: boolean;
  protect?: string[];
};

export const COACH_USAGE =
  "--project <dir> [--dir <extra dir>]... [--session <id>] [--model sonnet] [--mcp-config <file.json>] [--allow-changes server1,server2] [--instructions <file.md>] [--knowledge <file or folder>]... [--web]";

export function parseServerList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export async function coachOptionsFromArgs(values: CoachArgValues): Promise<CoachOptions> {
  if (!values.project) throw new Error(`missing --project\nusage: ${COACH_USAGE}`);
  return {
    project: path.resolve(values.project),
    extraDirectories: (values.dir ?? []).map((dir) => path.resolve(dir)),
    db: openAppDb(values.db),
    sessionId: values.session,
    model: values.model,
    pathToClaudeCodeExecutable: values.claude,
    ...(await loadMcpConfig(values["mcp-config"])),
    allowChanges: parseServerList(values["allow-changes"]),
    instructions: values.instructions ? await Bun.file(values.instructions).text() : "",
    knowledge: (values.knowledge ?? []).map((entry) => path.resolve(entry)),
    webAccess: values.web ?? false,
    protectedDirs: expandProtectedRoots([path.dirname(path.resolve(values.db)), ...(values.protect ?? [])]),
  };
}
