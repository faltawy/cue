import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { answerInput, parseQuestions } from "@anlg/assistant/questions";

import {
  CodexClient,
  EventQueue,
  prepareCodexHome,
  record,
} from "./codex-client";
import { loadCodexMcpTools } from "./codex-mcp";
import { codexFileTools } from "./codex-tools";
import { decide } from "./guard";
import { type AskContent } from "./images";
import { meetingTools } from "./meeting-server";
import { type RuntimeMessage, RuntimeMessageType } from "./runtime-message";
import { type RuntimeTool, type ToolResult } from "./runtime-tool";
import {
  type CoachOptions,
  coachPrompt,
  type CoachSession,
  readRoots,
  userContextPrompt,
  WEB_PROMPT,
} from "./session";
import { MissingConversationError } from "./supervisor";
import { failed, text } from "./tool-result";

export const DEFAULT_CODEX_HOME = path.join(
  os.homedir(),
  "Library/Caches/com.hyprnote.dev/codex/account",
);

export function codexInput(content: AskContent): unknown[] {
  if (typeof content === "string")
    return [
      { type: "text", text: codexToolReferences(content), text_elements: [] },
    ];
  return content.flatMap((part): unknown[] => {
    if (part.type === "text")
      return [
        {
          type: "text",
          text: codexToolReferences(part.text),
          text_elements: [],
        },
      ];
    if (part.type === "image" && part.source.type === "base64")
      return [
        {
          type: "image",
          url: `data:${part.source.media_type};base64,${part.source.data}`,
        },
      ];
    throw new Error("This attachment type is not supported by Codex.");
  });
}

export function codexDynamicToolName(name: string): string {
  return name.startsWith("mcp__")
    ? `cue_${name.slice(5).replace("__", "_")}`
    : name;
}

export function codexToolReferences(prompt: string): string {
  return prompt.replace(
    /mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)/g,
    "cue_$1_$2",
  );
}

export function startCodexSession(options: {
  executable: string;
  home?: string;
  model?: string;
  prompt: string;
  resume?: string;
  tools?: RuntimeTool[];
  loadTools?: (signal: AbortSignal) => Promise<{
    tools: RuntimeTool[];
    close: () => Promise<void>;
  }>;
  schema?: Record<string, unknown>;
  ephemeral?: boolean;
  web?: boolean;
  signal?: AbortSignal;
  stderr?: (chunk: string) => void;
  authorize?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: CoachOptions["onToolResult"];
}): CoachSession {
  const messages = new EventQueue<RuntimeMessage>();
  const tools = new Map(
    (options.tools ?? []).map((entry) => [
      codexDynamicToolName(entry.name),
      entry,
    ]),
  );
  let client: CodexClient | undefined;
  let closeTools: (() => Promise<void>) | undefined;
  let threadId = "";
  let turnId = "";
  let closed = false;
  let active = false;
  let turnAbort = new AbortController();
  const lifecycle = new AbortController();
  let interrupted = false;
  let model = options.model ?? "";
  let lastError = "";
  let inputTokens = 0,
    cachedTokens = 0,
    outputTokens = 0;
  let contextWindow = 0;
  let seenUsage = "";
  const home = options.home ?? DEFAULT_CODEX_HOME;

  function result(ok: boolean, error = "") {
    if (!active) return;
    active = false;
    messages.push({
      type: RuntimeMessageType.Result,
      subtype: ok ? "success" : interrupted ? "interrupted" : "error",
      is_error: !ok,
      session_id: threadId || undefined,
      result: error,
      usage: {
        input_tokens: inputTokens,
        cache_read_input_tokens: cachedTokens,
        output_tokens: outputTokens,
      },
      total_cost_usd: 0,
      modelUsage: model
        ? {
            [model]: {
              inputTokens,
              cacheReadInputTokens: cachedTokens,
              outputTokens,
              contextWindow,
            },
          }
        : {},
    });
  }
  const ready = (async () => {
    await prepareCodexHome(home);
    if (closed) return;
    const loaded = await options.loadTools?.(lifecycle.signal);
    if (loaded) {
      closeTools = loaded.close;
      if (closed) {
        await loaded.close();
        return;
      }
      for (const entry of loaded.tools)
        tools.set(codexDynamicToolName(entry.name), entry);
    }
    client = new CodexClient({
      executable: options.executable,
      home,
      stderr: options.stderr,
      onFailure: (error) => {
        result(false, error.message);
        messages.close(error);
      },
      onRequest: async (method, params) => {
        if (method !== "item/tool/call")
          throw new Error(
            "Cue does not allow native commands, file edits, or permission escalation.",
          );
        const codexName = String(params.tool ?? "");
        const id = String(params.callId ?? "");
        const input = record(params.arguments);
        const entry = tools.get(codexName);
        if (!entry || closed || interrupted || !active)
          return {
            contentItems: [
              { type: "inputText", text: "This tool is unavailable." },
            ],
            success: false,
          };
        const name = entry.name;
        messages.push({ type: RuntimeMessageType.ToolStart, id, name, input });
        let response: ToolResult;
        try {
          options.authorize?.(name, input);
          response = await entry.handler(input, {
            signal: turnAbort.signal,
            toolUseID: id,
          });
        } catch (error) {
          response = {
            content: [{ type: "text", text: String(error) }],
            isError: true,
          };
        }
        options.onToolResult?.(id, response, name);
        messages.push({
          type: RuntimeMessageType.ToolResult,
          id,
          content: response.content,
          isError: response.isError === true,
        });
        return {
          contentItems: response.content.map((part) =>
            part.type === "image"
              ? {
                  type: "inputImage",
                  imageUrl: `data:${part.mimeType};base64,${part.data}`,
                }
              : {
                  type: "inputText",
                  text: part.text,
                },
          ),
          success: response.isError !== true,
        };
      },
      onNotification: (method, params) => {
        if (params.threadId && params.threadId !== threadId) return;
        if (method === "turn/started")
          turnId = String(record(params.turn).id ?? "");
        if (method === "item/agentMessage/delta" && active)
          messages.push({
            type: RuntimeMessageType.Text,
            delta: String(params.delta ?? ""),
          });
        if (method === "error" && params.willRetry !== true)
          lastError = String(record(params.error).message ?? "Codex failed.");
        if (method === "thread/tokenUsage/updated" && active) {
          const usage = record(params.tokenUsage);
          const signature = JSON.stringify(usage.total);
          if (signature === seenUsage) return;
          seenUsage = signature;
          const last = record(usage.last);
          const count = (key: string) =>
            typeof last[key] === "number" ? Math.max(0, last[key]) : 0;
          const cached = count("cachedInputTokens");
          inputTokens += Math.max(0, count("inputTokens") - cached);
          cachedTokens += cached;
          outputTokens += count("outputTokens");
          contextWindow = Number(usage.modelContextWindow) || 0;
          messages.push({
            type: RuntimeMessageType.AssistantUsage,
            usage: { input_tokens: count("inputTokens") },
          });
        }
        if (method === "turn/completed") {
          const turn = record(params.turn);
          if (turnId && turn.id !== turnId) return;
          result(
            turn.status === "completed",
            String(record(turn.error).message ?? lastError),
          );
        }
      },
    });
    await client.initialize();
    const response = await client
      .request(options.resume ? "thread/resume" : "thread/start", {
        ...(options.resume
          ? { threadId: options.resume }
          : {
              ephemeral: options.ephemeral ?? false,
              dynamicTools: [...tools].map(([name, entry]) => ({
                type: "function",
                name,
                description: entry.description,
                inputSchema:
                  entry.jsonSchema ??
                  z.toJSONSchema(z.object(entry.inputSchema)),
              })),
            }),
        cwd: home,
        permissions: "cue",
        approvalPolicy: "never",
        baseInstructions: options.prompt,
        ...(options.model ? { model: options.model } : {}),
        config: { web_search: options.web ? "live" : "disabled" },
      })
      .catch((error: unknown) => {
        if (
          options.resume &&
          error instanceof Error &&
          error.message === `no rollout found for thread id ${options.resume}`
        )
          throw new MissingConversationError(options.resume);
        throw error;
      });
    threadId = String(record(response.thread).id ?? "");
    if (!threadId) throw new Error("Codex returned no conversation ID.");
    model = typeof response.model === "string" ? response.model : model;
  })();
  // Attach a handler immediately: startup can fail before the first ask.
  void ready.catch((error: unknown) => {
    if (error instanceof MissingConversationError) active = false;
    else result(false, String(error));
    messages.close(error instanceof Error ? error : new Error(String(error)));
    client?.close();
    void closeTools?.();
  });

  const close = () => {
    closed = true;
    lifecycle.abort();
    turnAbort.abort();
    client?.close();
    void closeTools?.();
    messages.close();
    options.signal?.removeEventListener("abort", abort);
  };
  const abort = () => {
    interrupted = true;
    result(false);
    close();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  return {
    messages,
    ask(content) {
      if (active || closed)
        throw new Error("Codex is already answering or closed.");
      active = true;
      interrupted = false;
      turnAbort = new AbortController();
      turnId = "";
      lastError = "";
      inputTokens = 0;
      cachedTokens = 0;
      outputTokens = 0;
      void ready
        .then(async () => {
          if (closed || !active) return;
          const response = await client!.request("turn/start", {
            threadId,
            input: codexInput(content),
            ...(options.schema ? { outputSchema: options.schema } : {}),
          });
          if (active) turnId = String(record(response.turn).id ?? turnId);
          if (interrupted && active && turnId)
            await client!.request("turn/interrupt", { threadId, turnId });
        })
        .catch((error: unknown) => result(false, String(error)));
    },
    async interrupt() {
      interrupted = true;
      turnAbort.abort();
      await ready;
      if (turnId && active)
        return client?.request("turn/interrupt", { threadId, turnId });
    },
    abort,
    close,
  };
}

export function startCodexCoach(options: CoachOptions): CoachSession {
  if (!options.pathToCodexExecutable)
    throw new Error("Codex is not set up yet.");
  const roots = readRoots(options);
  const protectedRoots = [
    ...(options.protectedDirs ?? []),
    options.codexHome ?? DEFAULT_CODEX_HOME,
  ];
  const meeting = meetingTools(
    options.db,
    options.meeting ?? (() => options.sessionId),
    options.edits,
    options.show,
    options.highlight,
  ).map((entry) => ({ ...entry, name: `mcp__meeting__${entry.name}` }));
  const questionShape = {
    questions: z
      .array(
        z.object({
          question: z.string(),
          header: z.string(),
          multiSelect: z.boolean().default(false),
          options: z
            .array(z.object({ label: z.string(), description: z.string() }))
            .min(2)
            .max(4),
        }),
      )
      .min(1)
      .max(3),
  };
  const questions: RuntimeTool[] = options.askUser
    ? [
        {
          name: "AskUserQuestion",
          description:
            "Ask the user a short question with 2 to 4 choices when their answer would materially change your response.",
          inputSchema: questionShape,
          options: undefined,
          async handler(input, extra) {
            const parsed = z.object(questionShape).safeParse(input);
            if (!parsed.success)
              return failed(new Error(z.prettifyError(parsed.error)));
            const context = record(extra);
            const outcome = await options.askUser!(
              String(context.toolUseID ?? crypto.randomUUID()),
              parseQuestions(parsed.data),
              context.signal instanceof AbortSignal
                ? context.signal
                : new AbortController().signal,
            );
            return outcome.answered
              ? text(
                  JSON.stringify(answerInput(record(input), outcome.answers)),
                )
              : failed(new Error(outcome.reason));
          },
        },
      ]
    : [];
  const web = options.webAccess === true && (options.allowWeb?.() ?? true);
  return startCodexSession({
    executable: options.pathToCodexExecutable,
    home: options.codexHome,
    model: options.model,
    resume: options.resume,
    prompt: codexToolReferences(
      coachPrompt(
        options.allowChanges,
        !!options.edits,
        !!options.askUser,
        [],
        !!options.show,
        options.scope,
      ) +
        (web ? `\n${WEB_PROMPT}` : "") +
        userContextPrompt(options.knowledge, options.instructions),
    ),
    tools: [...meeting, ...questions, ...codexFileTools(roots, protectedRoots)],
    loadTools: (signal) => loadCodexMcpTools(options.mcpServers ?? {}, signal),
    web,
    stderr: options.stderr,
    signal: options.abortController?.signal,
    onToolResult: options.onToolResult,
    authorize(name, input) {
      if (name === "AskUserQuestion") return;
      const fileInput = ["Read", "Grep", "Glob"].includes(name)
        ? Object.fromEntries(
            Object.entries(input).map(([key, value]) => [
              key,
              ["file_path", "path"].includes(key) && typeof value === "string"
                ? path.resolve(options.project, value)
                : value,
            ]),
          )
        : input;
      const verdict = decide(
        name,
        fileInput,
        roots,
        options.allowChanges,
        [],
        false,
        protectedRoots,
      );
      if (!verdict.allow) throw new Error(verdict.reason);
    },
  });
}
