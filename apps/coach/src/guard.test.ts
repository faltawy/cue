import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseServerList } from "./args";
import { sessionEnv } from "./env";
import { decide, expandProtectedRoots, isReadOnlyCommand } from "./guard";
import {
  ASK_PROMPT,
  ASK_USER_TOOL,
  COACH_PROMPT,
  COACH_TOOLS,
  coachPrompt,
  coachQueryOptions,
  NOTES_PROMPT,
  readOnlyHook,
} from "./session";

const roots = ["/work/project", "/work/notes"];

describe("decide", () => {
  test("file edit tools are refused while reads inside the project are allowed", () => {
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(decide(tool, { file_path: "/work/project/a.ts" }, roots).allow).toBe(false);
    }
    expect(decide("Read", { file_path: "/work/project/a.ts" }, roots)).toEqual({ allow: true });
    expect(decide("Grep", { path: "/work/notes" }, roots)).toEqual({ allow: true });
  });

  test("reads outside the chosen folders are refused, including ../ escapes", () => {
    expect(decide("Read", { file_path: "/etc/passwd" }, roots).allow).toBe(false);
    expect(decide("Read", { file_path: "/work/project/../secrets.txt" }, roots).allow).toBe(false);
    expect(decide("Read", { file_path: "/work/projectile/a.ts" }, roots).allow).toBe(false);
  });

  test("MCP tools: the meeting server and read-style tools pass, mutating tools do not", () => {
    expect(decide("mcp__meeting__live_transcript", {}, roots).allow).toBe(true);
    expect(decide("mcp__fff__grep", {}, roots).allow).toBe(true);
    expect(decide("mcp__linear__list_issues", {}, roots).allow).toBe(true);
    expect(decide("mcp__linear__save_issue", {}, roots).allow).toBe(false);
    expect(decide("mcp__slack__slack_send_message", {}, roots).allow).toBe(false);
  });

  test("a server allowed to make changes may run its write tools; the same tool elsewhere is refused", () => {
    const tool = "mcp__clients__log_fact";
    expect(decide(tool, {}, roots).allow).toBe(false);
    expect(decide(tool, {}, roots, ["notes"]).allow).toBe(false);
    expect(decide(tool, {}, roots, ["clients"]).allow).toBe(true);
    expect(decide("mcp__notes__log_fact", {}, roots, ["clients"]).allow).toBe(false);
  });

  test("allowing changes on a server does not open built-in edits or shell writes", () => {
    expect(decide("Edit", { file_path: "/work/project/a.ts" }, roots, ["clients"]).allow).toBe(false);
    expect(decide("Bash", { command: "rm -rf src" }, roots, ["clients"]).allow).toBe(false);
  });

  test("unknown built-in tools are refused", () => {
    expect(decide("WebFetch", { url: "https://example.com" }, roots).allow).toBe(false);
  });
});

describe("the app's own data and settings", () => {
  const me = os.homedir();
  const home = [me];
  const appData = [`${me}/Library/Application Support/com.cue.app`, "/tmp/coach-mcp"];
  const read = (tool: string, input: Record<string, unknown>) => decide(tool, input, home, [], [], false, appData);

  test("files inside the app's data are refused even when a project folder contains them", () => {
    expect(read("Read", { file_path: `${me}/Library/Application Support/com.cue.app/app.db` }).allow).toBe(false);
    expect(read("Read", { file_path: "/tmp/coach-mcp/servers.json" }).allow).toBe(false);
    expect(read("Grep", { pattern: "token", path: `${me}/Library/Application Support/com.cue.app` }).allow).toBe(false);
    expect(read("Glob", { pattern: "**/*", path: `${me}/Library` }).allow).toBe(false);
    expect(read("Read", { file_path: `${me}/notes/plan.md` })).toEqual({ allow: true });
    expect(read("Grep", { pattern: "x", path: `${me}/notes` })).toEqual({ allow: true });
  });

  test("shell commands that name the app's data are refused; other reads still run", () => {
    for (const command of [
      `cat "${me}/Library/Application Support/com.cue.app/settings.json"`,
      "ls ~/Library/Application\\ Support/com.cue.app",
      "grep -r token /tmp/coach-mcp",
    ]) {
      expect(read("Bash", { command }).allow).toBe(false);
    }
    expect(read("Bash", { command: `cat ${me}/notes/plan.md` })).toEqual({ allow: true });
  });

  test("the meeting tools stay allowed", () => {
    expect(read("mcp__meeting__get_meeting", { id: "x" })).toEqual({ allow: true });
  });

  test("the session applies the policy to both permission paths", async () => {
    const options = coachQueryOptions({ project: "/work/project", db: new Database(":memory:"), protectedDirs: ["/work/project/.app"] });
    const permission = { signal: new AbortController().signal, toolUseID: "t", requestId: "r" };

    expect(await options.canUseTool?.("Read", { file_path: "/work/project/.app/app.db" }, permission)).toMatchObject({ behavior: "deny" });
    expect(await options.canUseTool?.("Read", { file_path: "/work/project/a.ts" }, permission)).toMatchObject({ behavior: "allow" });
    expect(await readOnlyHook(["/work/project"], [], [], () => false, ["/work/project/.app"])(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "cat /work/project/.app/settings.json" },
        tool_use_id: "t",
        session_id: "s",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/work/project",
      },
      "t",
      { signal: new AbortController().signal },
    )).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  });
});

describe("claude.ai connectors", () => {
  const gmail = "claude_ai_Gmail";
  const calendar = "claude_ai_Google_Calendar";

  test("a connector's tools run only when the user turned that connector on", () => {
    expect(decide("mcp__claude_ai_Gmail__search_threads", {}, roots, [], [gmail])).toEqual({ allow: true });
    expect(decide("mcp__claude_ai_Gmail__search_threads", {}, roots, [], [])).toEqual({
      allow: false,
      reason: expect.stringContaining("not turned on"),
    });
    expect(decide("mcp__claude_ai_Google_Calendar__list_events", {}, roots, [], [gmail])).toEqual({
      allow: false,
      reason: expect.stringContaining("not turned on"),
    });
  });

  test("allowing changes does not open a connector that is not turned on", () => {
    expect(decide("mcp__claude_ai_Notion__notion-update-page", {}, roots, ["claude_ai_Notion"], [gmail]).allow).toBe(
      false,
    );
    expect(decide("mcp__claude_ai_Gmail__create_draft", {}, roots, [gmail], [gmail]).allow).toBe(true);
  });

  test.each([
    "send_message",
    "reply",
    "forward",
    "trash_message",
    "trash_thread",
    "untrash_thread",
    "delete_draft",
    "delete_label",
    "mark_thread_spam",
    "unmark_message_spam",
    "label_thread",
    "unlabel_message",
    "update_message_labels",
    "apply_sensitive_thread_label",
    "create_label",
  ])("Gmail %s is refused even when changes are allowed", (name) => {
    expect(decide("mcp__claude_ai_Gmail__create_draft", {}, roots, [gmail], [gmail])).toEqual({ allow: true });
    expect(decide(`mcp__claude_ai_Gmail__${name}`, {}, roots, [gmail], [gmail])).toEqual({
      allow: false,
      reason: expect.stringContaining("The coach drafts emails; you send them."),
    });
  });

  test("a second Gmail account gets the same refusals", () => {
    const second = "claude_ai_Gmail_2";
    expect(decide("mcp__claude_ai_Gmail_2__update_draft", {}, roots, [second], [second]).allow).toBe(true);
    expect(decide("mcp__claude_ai_Gmail_2__send_message", {}, roots, [second], [second]).allow).toBe(false);
  });

  test("Gmail drafts need Allow changes; reading never does", () => {
    for (const name of ["create_draft", "update_draft"]) {
      expect(decide(`mcp__claude_ai_Gmail__${name}`, {}, roots, [], [gmail]).allow).toBe(false);
      expect(decide(`mcp__claude_ai_Gmail__${name}`, {}, roots, [gmail], [gmail]).allow).toBe(true);
    }
    for (const name of ["search_threads", "get_thread", "get_message", "list_drafts", "get_draft", "list_labels"]) {
      expect(decide(`mcp__claude_ai_Gmail__${name}`, {}, roots, [], [gmail]).allow).toBe(true);
    }
  });

  test("other connectors read freely and change data only with Allow changes", () => {
    expect(decide("mcp__claude_ai_Google_Calendar__list_events", {}, roots, [], [calendar]).allow).toBe(true);
    expect(decide("mcp__claude_ai_Google_Calendar__create_event", {}, roots, [], [calendar]).allow).toBe(false);
    expect(decide("mcp__claude_ai_Google_Calendar__create_event", {}, roots, [calendar], [calendar]).allow).toBe(true);
  });
});

describe("isReadOnlyCommand", () => {
  test.each([
    "rg -n pricing src",
    "git log --oneline -5",
    "git show HEAD:README.md | head -20",
    "sed -n 1,40p src/a.ts",
    "ls -la && wc -l src/a.ts",
  ])("allows %s", (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  test.each([
    "rm -rf src",
    "git push origin main",
    "git checkout -- .",
    "echo hi > file.txt",
    "cat a >> b",
    "rg x | xargs rm",
    "sed -i s/a/b/ file",
    "find . -delete",
    "ls $(rm -rf /)",
    "npm install",
    "",
  ])("refuses %s", (command) => {
    expect(isReadOnlyCommand(command)).toBe(false);
  });
});

describe("sessionEnv", () => {
  test("drops an inherited Anthropic key so the session uses the Claude sign-in", () => {
    const env = sessionEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_AUTH_TOKEN: "tok" });
    expect(env).toMatchObject({ PATH: "/bin" });
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
  });

  test("turns off Claude Code telemetry, error reporting and update checks, even if the parent enabled them", () => {
    const env = sessionEnv({ PATH: "/bin", DISABLE_TELEMETRY: "0" });
    expect(env).toMatchObject({
      PATH: "/bin",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
    });
  });

  test("never hands the app bridge address or token to Claude Code", () => {
    const env = sessionEnv({
      PATH: "/bin",
      CUE_COACH_APP_URL: "http://127.0.0.1:5000",
      CUE_COACH_APP_TOKEN: "secret",
    });
    expect(env).toMatchObject({ PATH: "/bin" });
    expect(env).not.toHaveProperty("CUE_COACH_APP_URL");
    expect(env).not.toHaveProperty("CUE_COACH_APP_TOKEN");
  });

  test("never hands the coach server's own launch secret to Claude Code", () => {
    const env = sessionEnv({ PATH: "/bin", CUE_COACH_TOKEN: "launch-secret" });
    expect(env).toMatchObject({ PATH: "/bin" });
    expect(env).not.toHaveProperty("CUE_COACH_TOKEN");
  });

  test("keeps the key when requests are routed to another endpoint", () => {
    const env = sessionEnv({ ANTHROPIC_BASE_URL: "http://gateway", ANTHROPIC_API_KEY: "sk-test" });
    expect(env).toMatchObject({ ANTHROPIC_BASE_URL: "http://gateway", ANTHROPIC_API_KEY: "sk-test" });
  });
});

describe("parseServerList", () => {
  test("splits the --allow-changes value and ignores blanks", () => {
    expect(parseServerList("clients, notes,,")).toEqual(["clients", "notes"]);
    expect(parseServerList(undefined)).toEqual([]);
  });
});

describe("coachPrompt", () => {
  test("names the servers that may change data, and says nothing when none may", () => {
    expect(coachPrompt([])).toBe(COACH_PROMPT);
    expect(coachPrompt(["clients"])).toContain("Tools from clients may change data");
  });

  test("offers library reads always and library changes only when the app accepts them", () => {
    expect(COACH_PROMPT).toContain("mcp__meeting__search_meetings");
    expect(coachPrompt([], true)).toContain("only when the user asks or confirms");
    expect(coachPrompt([], true)).toContain("Nothing can be deleted");
    expect(coachPrompt([], false)).not.toContain("create_note");
  });

  test("mentions note edits only when the app accepts them", () => {
    expect(coachPrompt([], true)).toContain(NOTES_PROMPT);
    expect(coachPrompt([], false)).not.toContain("meeting_notes");
    expect(coachPrompt(["clients"], true)).toContain("Tools from clients may change data");
  });

  test("tells the coach it may search email and draft follow-ups, never send, only when Gmail is on", () => {
    expect(coachPrompt([], false, false, ["claude_ai_Gmail"])).toContain("search the user's email");
    expect(coachPrompt(["claude_ai_Gmail"], false, false, ["claude_ai_Gmail"])).toContain("never send");
    expect(coachPrompt([], false, false, ["claude_ai_Google_Calendar"])).not.toContain("email");
  });
});

describe("questions to the user", () => {
  const hook = readOnlyHook(roots);
  const preToolUse = (tool_name: string, tool_input: Record<string, unknown>) =>
    hook(
      {
        hook_event_name: "PreToolUse",
        tool_name,
        tool_input,
        tool_use_id: "t",
        session_id: "s",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/work/project",
      },
      "t",
      { signal: new AbortController().signal },
    );

  test("the read-only hook leaves AskUserQuestion to the permission check that collects the answer, and still refuses edits", async () => {
    expect(await preToolUse("AskUserQuestion", { questions: [] })).toEqual({});
    expect(await preToolUse("Edit", { file_path: "/work/project/a.ts" })).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
    expect(await preToolUse("Read", { file_path: "/work/project/a.ts" })).toMatchObject({
      hookSpecificOutput: { permissionDecision: "allow" },
    });
  });

  test("AskUserQuestion is offered only when someone can answer", () => {
    const db = new Database(":memory:");
    const base = { project: "/work/project", db };
    expect(coachQueryOptions(base).tools).toEqual(COACH_TOOLS);
    const asking = coachQueryOptions({ ...base, askUser: async () => ({ answered: false, reason: "test" }) });
    expect(asking.tools).toEqual([...COACH_TOOLS, ASK_USER_TOOL]);
    expect(asking.systemPrompt).toMatchObject({ append: expect.stringContaining(ASK_PROMPT) });
    expect(coachQueryOptions(base).systemPrompt).not.toMatchObject({ append: expect.stringContaining("AskUserQuestion") });
  });

  test("a resumed chat passes the Claude session id; a fresh one doesn't", () => {
    const db = new Database(":memory:");
    expect(coachQueryOptions({ project: "/p", db, resume: "claude-1" }).resume).toBe("claude-1");
    expect(coachQueryOptions({ project: "/p", db })).not.toHaveProperty("resume");
  });
});

describe("claude.ai connectors in the session", () => {
  test("they join only when some are turned on, without loosening the explicit MCP config", async () => {
    const db = new Database(":memory:");
    const gmail = {
      type: "claudeai-proxy",
      id: "mcpsrv_01gmail",
      url: "https://gmailmcp.googleapis.com/mcp/v1",
    } as const;
    const search = "mcp__claude_ai_Gmail__search_threads";
    const permission = { signal: new AbortController().signal, toolUseID: "t", requestId: "r" };
    const preToolUse = (options: ReturnType<typeof coachQueryOptions>, tool_name: string) =>
      options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
        {
          hook_event_name: "PreToolUse",
          tool_name,
          tool_input: {},
          tool_use_id: "t",
          session_id: "s",
          transcript_path: "/tmp/t.jsonl",
          cwd: "/p",
        },
        "t",
        { signal: permission.signal },
      );

    for (const off of [coachQueryOptions({ project: "/p", db }), coachQueryOptions({ project: "/p", db, connectors: {} })]) {
      expect(off.strictMcpConfig).toBe(true);
      expect(off).not.toHaveProperty("extraArgs");
      expect(await off.canUseTool?.(search, {}, permission)).toMatchObject({ behavior: "deny" });
      expect(await preToolUse(off, search)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
    }

    const on = coachQueryOptions({ project: "/p", db, connectors: { claude_ai_Gmail: gmail } });
    expect(on.strictMcpConfig).toBe(true);
    expect(JSON.parse(on.extraArgs?.["mcp-config"] ?? "{}")).toEqual({ mcpServers: { claude_ai_Gmail: gmail } });
    expect(Object.keys(on.mcpServers ?? {})).toEqual(["meeting"]);
    expect(await on.canUseTool?.(search, {}, permission)).toMatchObject({ behavior: "allow" });
    expect(await preToolUse(on, search)).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } });
    expect(await on.canUseTool?.("mcp__claude_ai_Gmail__send_message", {}, permission)).toMatchObject({
      behavior: "deny",
    });
    expect(await preToolUse(on, "mcp__claude_ai_Gmail__send_message")).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  });
});

describe("coach instructions and knowledge", () => {
  const db = new Database(":memory:");
  const instructions = "I'm the CTO of Northwind; prefer short answers; never promise dates.\n\n- Use **bold** sparingly";
  const knowledge = ["/work/kb", "/work/pricing.md"];
  const permission = { signal: new AbortController().signal, toolUseID: "t", requestId: "r" };
  const appendOf = (options: ReturnType<typeof coachQueryOptions>) =>
    typeof options.systemPrompt === "object" && !Array.isArray(options.systemPrompt) && "append" in options.systemPrompt
      ? options.systemPrompt.append
      : undefined;

  test("the user's instructions close the system prompt verbatim, and knowledge is named by path", () => {
    const append = appendOf(coachQueryOptions({ project: "/p", db, instructions, knowledge }));
    expect(append?.endsWith(instructions)).toBe(true);
    expect(append).toContain("Reference material you can read when relevant: /work/kb, /work/pricing.md");
    expect(append?.startsWith(COACH_PROMPT)).toBe(true);
  });

  test("knowledge is readable; nothing outside it is, and it is never writable", async () => {
    const options = coachQueryOptions({ project: "/p", db, knowledge });
    const ask = (tool: string, input: Record<string, unknown>) => options.canUseTool?.(tool, input, permission);
    expect(await ask("Read", { file_path: "/work/kb/faq.md" })).toMatchObject({ behavior: "allow" });
    expect(await ask("Grep", { pattern: "price", path: "/work/kb" })).toMatchObject({ behavior: "allow" });
    expect(await ask("Glob", { pattern: "*.md", path: "/work/kb/notes" })).toMatchObject({ behavior: "allow" });
    expect(await ask("Read", { file_path: "/work/pricing.md" })).toMatchObject({ behavior: "allow" });
    expect(await ask("Read", { file_path: "/work/secrets.txt" })).toMatchObject({ behavior: "deny" });
    expect(await ask("Read", { file_path: "/work/kb/../secrets.txt" })).toMatchObject({ behavior: "deny" });
    expect(await ask("Edit", { file_path: "/work/kb/faq.md" })).toMatchObject({ behavior: "deny" });
    expect(await ask("Write", { file_path: "/work/kb/new.md" })).toMatchObject({ behavior: "deny" });
  });

  test("empty instructions and knowledge leave the session exactly as before", async () => {
    const plain = coachQueryOptions({ project: "/p", db });
    const empty = coachQueryOptions({ project: "/p", db, instructions: "  \n", knowledge: [] });
    const set = coachQueryOptions({ project: "/p", db, instructions, knowledge });
    expect(appendOf(empty)).toBe(appendOf(plain));
    expect(appendOf(set)).not.toBe(appendOf(plain));
    const read = { file_path: "/work/kb/faq.md" };
    expect(await empty.canUseTool?.("Read", read, permission)).toMatchObject({ behavior: "deny" });
    expect(await set.canUseTool?.("Read", read, permission)).toMatchObject({ behavior: "allow" });
  });
});

describe("web access", () => {
  const db = new Database(":memory:");
  const permission = { signal: new AbortController().signal, toolUseID: "t", requestId: "r" };
  const search = { query: "Northwind funding" };

  test("the guard lets WebSearch and WebFetch through only when web access is on", () => {
    for (const tool of ["WebSearch", "WebFetch"]) {
      expect(decide(tool, search, roots, [], [], true)).toEqual({ allow: true });
      expect(decide(tool, search, roots, [], [], false).allow).toBe(false);
    }
    expect(decide("Edit", { file_path: "/work/project/a.ts" }, roots, [], [], true).allow).toBe(false);
  });

  test("the session offers the web tools and the web guidance only when web access is on", async () => {
    const off = coachQueryOptions({ project: "/p", db });
    const on = coachQueryOptions({ project: "/p", db, webAccess: true });
    expect(off.tools).toEqual(COACH_TOOLS);
    expect(on.tools).toEqual([...COACH_TOOLS, "WebSearch", "WebFetch"]);
    expect(on.systemPrompt).toMatchObject({ append: expect.stringContaining("cite the source URL") });
    expect(off.systemPrompt).not.toMatchObject({ append: expect.stringContaining("cite the source URL") });
    expect(await off.canUseTool?.("WebSearch", search, permission)).toMatchObject({ behavior: "deny" });
    expect(await on.canUseTool?.("WebSearch", search, permission)).toMatchObject({ behavior: "allow" });
  });

  test("a turn that may not use the web is refused without changing the session's tools or prompt", async () => {
    let allowed = false;
    const options = coachQueryOptions({ project: "/p", db, webAccess: true, allowWeb: () => allowed });
    const before = JSON.stringify([options.tools, options.systemPrompt]);
    expect(await options.canUseTool?.("WebFetch", { url: "https://northwind.com" }, permission)).toMatchObject({
      behavior: "deny",
    });
    allowed = true;
    expect(await options.canUseTool?.("WebFetch", { url: "https://northwind.com" }, permission)).toMatchObject({
      behavior: "allow",
    });
    expect(JSON.stringify([options.tools, options.systemPrompt])).toBe(before);
  });
});

describe("a data folder reached through a symlink", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "coach-guard-")));
  const dataFolder = path.join(base, "Cue");
  const link = path.join(base, "anarlog");
  fs.mkdirSync(dataFolder);
  fs.writeFileSync(path.join(dataFolder, "app.db"), "");
  fs.writeFileSync(path.join(base, "notes.md"), "");
  fs.symlinkSync("Cue", link);
  const read = (tool: string, input: Record<string, unknown>) =>
    decide(tool, input, [base], [], [], false, expandProtectedRoots([dataFolder]));

  test("file tools refuse the database through the old folder name", () => {
    expect(read("Read", { file_path: path.join(link, "app.db") }).allow).toBe(false);
    expect(read("Grep", { pattern: "x", path: link }).allow).toBe(false);
    expect(read("Read", { file_path: path.join(base, "notes.md") })).toEqual({ allow: true });
  });

  test("shell commands refuse the database through the old folder name", () => {
    expect(read("Bash", { command: `cat ${path.join(link, "app.db")}` }).allow).toBe(false);
    expect(read("Bash", { command: `cat ${path.join(base, "notes.md")}` })).toEqual({ allow: true });
  });
});
