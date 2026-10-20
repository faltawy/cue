import fs from "node:fs";
import path from "node:path";

export type GuardDecision = { allow: true } | { allow: false; reason: string };

export const REMOVED_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

export const WEB_TOOLS = ["WebSearch", "WebFetch"];

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS", "TodoWrite", "Task", "Agent", "ToolSearch"]);

const READ_ONLY_COMMANDS = new Set([
  "rg",
  "grep",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "find",
  "fd",
  "tree",
  "pwd",
  "stat",
  "file",
  "jq",
  "sort",
  "uniq",
  "cut",
]);

const READ_ONLY_GIT = new Set(["log", "show", "diff", "status", "grep", "blame", "ls-files", "rev-parse", "branch"]);

const MCP_READ_VERB = /^(get|list|search|find|read|query|fetch|recall|describe|show|count|lookup|grep|multi_grep|find_files)/;

export const CONNECTOR_PREFIX = "claude_ai_";
export const GMAIL_SERVER = /^claude_ai_Gmail(_\d+)?$/;
const GMAIL_DRAFTS = new Set(["create_draft", "update_draft"]);
const GMAIL_REFUSAL =
  "The coach drafts emails; you send them. It never sends, replies, forwards, trashes, deletes, labels or marks mail.";

const SHELL_WRITE_SYNTAX = /(^|[^<>&|])>|>>|\$\(|`|\btee\b|\bxargs\b|\bsed\s+-i\b|-delete\b|-exec\b/;

function commandSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isReadOnlySegment(segment: string): boolean {
  const [program, subcommand] = segment.split(/\s+/);
  if (!program) return false;
  if (program === "git") return subcommand !== undefined && READ_ONLY_GIT.has(subcommand);
  if (program === "sed") return /^sed\s+-n\b/.test(segment);
  return READ_ONLY_COMMANDS.has(program);
}

export function isReadOnlyCommand(command: string): boolean {
  if (SHELL_WRITE_SYNTAX.test(command)) return false;
  const segments = commandSegments(command);
  return segments.length > 0 && segments.every(isReadOnlySegment);
}

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(root, target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathOf(input: Record<string, unknown>): string | undefined {
  const value = input.file_path ?? input.path ?? input.notebook_path;
  return typeof value === "string" ? value : undefined;
}

const PROTECTED_REASON =
  "The app's own data, settings, recordings and secrets are off-limits to the coach; use the meeting tools for notes and contacts.";

function realPath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

// Shell commands are matched by text, so a symlink next to a protected folder
// (the old "anarlog" data folder name, for one) is protected under its own name.
export function expandProtectedRoots(roots: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const root of roots) {
    const resolved = path.resolve(root);
    const real = realPath(resolved);
    expanded.add(resolved).add(real);
    let siblings: fs.Dirent[] = [];
    try {
      siblings = fs.readdirSync(path.dirname(real), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sibling of siblings) {
      if (!sibling.isSymbolicLink()) continue;
      const link = path.join(path.dirname(real), sibling.name);
      if (isInside(real, realPath(link))) expanded.add(link);
    }
  }
  return [...expanded];
}

function touchesProtected(target: string, protectedRoots: readonly string[], recursive: boolean): boolean {
  const targets = [target, realPath(target)];
  return protectedRoots.some((root) =>
    targets.some((candidate) => isInside(root, candidate) || (recursive && isInside(candidate, root))),
  );
}

function homeForms(root: string): string[] {
  const home = process.env.HOME;
  const forms = [root, root.replaceAll(" ", "\\ ")];
  if (home && isInside(home, root)) {
    const relative = `~/${path.relative(home, root)}`;
    forms.push(relative, relative.replaceAll(" ", "\\ "));
  }
  return forms;
}

function commandTouchesProtected(command: string, protectedRoots: readonly string[]): boolean {
  return protectedRoots.some((root) => homeForms(path.resolve(root)).some((form) => command.includes(form)));
}

function connectorName(server: string): string {
  return server.slice(CONNECTOR_PREFIX.length).replaceAll("_", " ");
}

function gmailDecision(name: string, allowChanges: boolean): GuardDecision {
  if (GMAIL_DRAFTS.has(name)) {
    return allowChanges
      ? { allow: true }
      : { allow: false, reason: "Turn on Allow changes for Gmail to let the coach write drafts." };
  }
  return MCP_READ_VERB.test(name) ? { allow: true } : { allow: false, reason: GMAIL_REFUSAL };
}

export function decide(
  toolName: string,
  input: Record<string, unknown>,
  roots: string[],
  allowChanges: readonly string[] = [],
  connectors: readonly string[] = [],
  web = false,
  protectedRoots: readonly string[] = [],
): GuardDecision {
  if (REMOVED_TOOLS.includes(toolName)) {
    return { allow: false, reason: "The coach cannot edit files." };
  }

  if (WEB_TOOLS.includes(toolName)) {
    return web ? { allow: true } : { allow: false, reason: "The coach can't use the web right now." };
  }

  if (READ_TOOLS.has(toolName)) {
    const target = pathOf(input);
    if (target && touchesProtected(target, protectedRoots, toolName !== "Read")) {
      return { allow: false, reason: PROTECTED_REASON };
    }
    if (target && !roots.some((root) => isInside(root, target))) {
      return { allow: false, reason: `${target} is outside the meeting's project folders.` };
    }
    return { allow: true };
  }

  if (toolName === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    if (commandTouchesProtected(command, protectedRoots)) return { allow: false, reason: PROTECTED_REASON };
    return isReadOnlyCommand(command)
      ? { allow: true }
      : { allow: false, reason: "Only read-only shell commands are allowed during a meeting." };
  }

  if (toolName.startsWith("mcp__meeting__")) return { allow: true };

  if (toolName.startsWith("mcp__")) {
    const [, server = "", name = ""] = toolName.split("__");
    if (server.startsWith(CONNECTOR_PREFIX)) {
      if (!connectors.includes(server)) {
        return {
          allow: false,
          reason: `${connectorName(server)} is not turned on for the coach. Turn it on in Settings → Claude → Tools.`,
        };
      }
      if (GMAIL_SERVER.test(server)) return gmailDecision(name, allowChanges.includes(server));
    }
    if (allowChanges.includes(server)) return { allow: true };
    return MCP_READ_VERB.test(name)
      ? { allow: true }
      : { allow: false, reason: `${toolName} may change data; the coach only reads during a meeting.` };
  }

  return { allow: false, reason: `${toolName} is not available to the coach.` };
}
