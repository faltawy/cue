import {
  BROWSER_PROTOCOL_VERSION,
  BrowserResponseStatus,
} from "@anlg/assistant/browser-context";

import { debug, DebugEvent } from "./debug";
import { ErrorCode, ExtensionError, nativeDisconnect } from "./errors";
import { Operation, type NativeReply, replySchema } from "./protocol";

export class NativeClient {
  private port: chrome.runtime.Port | null = null;
  private pending = new Map<
    string,
    {
      resolve(value: NativeReply): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
      started: number;
    }
  >();

  constructor(
    private host: string,
    private connect = (name: string) => chrome.runtime.connectNative(name),
  ) {}

  request(operation: Record<string, unknown>): Promise<NativeReply> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      debug(DebugEvent.NativeRequest, {
        run_id: requestId,
        operation: Object.values(Operation).find(
          (kind) => kind === operation.kind,
        ),
      });
      const timer = setTimeout(
        () => {
          this.pending.delete(requestId);
          reject(
            new ExtensionError(
              ErrorCode.Timeout,
              "Cue did not respond within seven seconds. Open Cue and retry.",
            ),
          );
        },
        operation.kind === Operation.Record ? 45_000 : 7000,
      );
      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        started: performance.now(),
      });
      try {
        if (!this.port) {
          const port = this.connect(this.host);
          this.port = port;
          port.onMessage.addListener((message: unknown) => {
            if (this.port !== port) return;
            const parsed = replySchema.safeParse(message);
            if (!parsed.success) {
              this.close(
                new ExtensionError(
                  ErrorCode.Protocol,
                  "Cue returned an unsupported response. Update Cue and the extension.",
                ),
              );
              return;
            }
            const pending = this.pending.get(parsed.data.request_id);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(parsed.data.request_id);
            const result = parsed.data.result;
            debug(DebugEvent.NativeReply, {
              run_id: parsed.data.request_id,
              duration_ms: Math.round(performance.now() - pending.started),
              code:
                result.status === BrowserResponseStatus.Error
                  ? result.error
                  : result.reply.kind,
            });
            if (result.status === BrowserResponseStatus.Error)
              pending.reject(new Error(result.error));
            else pending.resolve(result.reply);
          });
          port.onDisconnect.addListener(() => {
            // Reading lastError prevents Chromium from printing an unhandled API warning.
            const error =
              typeof chrome === "undefined"
                ? undefined
                : chrome.runtime.lastError;
            debug(DebugEvent.NativeDisconnect, {
              code: error ? "host_unavailable" : "closed",
            });
            console.warn("cue_native_disconnected", {
              reason: error ? "host_unavailable" : "closed",
              host: this.host,
              detail: error?.message,
            });
            if (this.port === port)
              this.close(nativeDisconnect(error?.message));
          });
        }
        this.port.postMessage({
          version: BROWSER_PROTOCOL_VERSION,
          request_id: requestId,
          operation,
        });
      } catch {
        this.close(
          new ExtensionError(
            ErrorCode.HostDisconnected,
            "Cannot open the native connection. Run browser setup in Cue, then retry.",
          ),
        );
      }
    });
  }

  close(reason: string | Error = "Connection closed") {
    const port = this.port;
    this.port = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason instanceof Error ? reason : new Error(reason));
    }
    this.pending.clear();
    port?.disconnect();
  }
}
