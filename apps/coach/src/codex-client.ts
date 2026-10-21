import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { sessionEnv } from "./env";

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export class EventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiting: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private ended = false;
  private error?: Error;
  push(value: T) {
    if (this.ended) return;
    const waiter = this.waiting.shift();
    if (waiter) waiter.resolve({ value, done: false });
    else this.values.push(value);
  }
  close(error?: Error) {
    if (this.ended) return;
    this.ended = true;
    this.error = error;
    for (const waiter of this.waiting.splice(0)) {
      if (error) waiter.reject(error);
      else waiter.resolve({ value: undefined, done: true });
    }
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.error) return Promise.reject(this.error);
        if (this.ended)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) =>
          this.waiting.push({ resolve, reject }),
        );
      },
    };
  }
}

// No user configuration or third-party tool discovery is inherited by the coach.
export const CODEX_CONFIG = {
  default_permissions: "cue",
  "permissions.cue.filesystem.:root": "deny",
  "agents.enabled": false,
  "features.multi_agent_v2": false,
  "features.standalone_web_search": true,
  "features.shell_tool": false,
  "features.unified_exec": false,
  "features.apps": false,
  "features.plugins": false,
  "features.skill_search": false,
  "features.multi_agent": false,
  "features.goals": false,
  "features.computer_use": false,
  "features.browser_use": false,
  "features.view_image": false,
  "features.default_mode_request_user_input": false,
  "features.skip_host_skill_discovery": true,
  web_search: "disabled",
  cli_auth_credentials_store: "file",
  project_doc_max_bytes: 0,
};

export class CodexClient {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private withdrawn = new Set<string | number>();
  private process: ChildProcessWithoutNullStreams;
  private stopped = false;
  private failure?: Error;
  readonly exited: Promise<void>;

  constructor(options: {
    executable: string;
    home: string;
    args?: string[];
    stderr?: (chunk: string) => void;
    onNotification?: (method: string, params: Record<string, unknown>) => void;
    onRequest?: (
      method: string,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    onFailure?: (error: Error) => void;
  }) {
    const args = options.args ?? [
      "app-server",
      ...Object.entries(CODEX_CONFIG).flatMap(([key, value]) => [
        "-c",
        `${key}=${JSON.stringify(value)}`,
      ]),
    ];
    this.process = spawn(options.executable, args, {
      cwd: options.home,
      env: {
        ...Object.fromEntries(
          Object.entries(sessionEnv(process.env)).filter(
            ([key]) => !key.startsWith("CODEX_") && !key.startsWith("OPENAI_"),
          ),
        ),
        HOME: options.home,
        XDG_CONFIG_HOME: path.join(options.home, "config"),
        XDG_DATA_HOME: path.join(options.home, "data"),
        XDG_CACHE_HOME: path.join(options.home, "cache"),
        CODEX_HOME: options.home,
        OPENAI_API_KEY: "",
        CODEX_API_KEY: "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const fail = (error: Error) => {
      if (this.failure) return;
      this.failure = error;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      if (!this.stopped) options.onFailure?.(error);
    };
    this.process.on("error", fail);
    this.process.stdin.on("error", fail);
    this.process.stderr.on("data", (chunk: Buffer) =>
      options.stderr?.(chunk.toString()),
    );
    const lines = readline.createInterface({ input: this.process.stdout });
    lines.on("line", (line) => {
      let message: Record<string, unknown>;
      try {
        message = record(JSON.parse(line));
      } catch {
        fail(new Error("Codex sent an invalid protocol message."));
        this.close();
        return;
      }
      const id = message.id;
      if (typeof message.method === "string") {
        const method = message.method;
        const params = record(message.params);
        if (typeof id === "number" || typeof id === "string") {
          void (
            options.onRequest
              ? options.onRequest(method, params)
              : Promise.reject(
                  new Error("This operation is unavailable in Cue."),
                )
          )
            .then((result) => {
              if (!this.withdrawn.delete(id)) this.send({ id, result });
            })
            .catch((error: unknown) => {
              if (!this.withdrawn.delete(id))
                this.send({
                  id,
                  error: { code: -32603, message: String(error) },
                });
            });
        } else {
          if (
            method === "serverRequest/resolved" &&
            (typeof params.requestId === "string" ||
              typeof params.requestId === "number")
          )
            this.withdrawn.add(params.requestId);
          options.onNotification?.(method, params);
        }
      } else if (typeof id === "number") {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (message.error)
          pending.reject(
            new Error(
              String(record(message.error).message ?? "Codex request failed."),
            ),
          );
        else pending.resolve(record(message.result));
      }
    });
    this.exited = new Promise((resolve) => {
      this.process.on("close", (code, signal) => {
        lines.close();
        fail(new Error(`Codex stopped (${signal ?? code}).`));
        resolve();
      });
    });
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "cue", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: "initialized" });
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = 30_000,
  ): Promise<Record<string, unknown>> {
    if (this.failure || this.stopped)
      return Promise.reject(this.failure ?? new Error("Codex is closed."));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  private send(message: unknown) {
    if (!this.stopped && !this.failure)
      this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  close() {
    if (this.stopped) return;
    this.stopped = true;
    this.process.kill("SIGTERM");
    const kill = setTimeout(() => this.process.kill("SIGKILL"), 2_000);
    kill.unref();
    void this.exited.then(() => clearTimeout(kill));
  }
}

export async function prepareCodexHome(home: string) {
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
}
