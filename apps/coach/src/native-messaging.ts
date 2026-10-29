import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import {
  BROWSER_PROTOCOL_VERSION,
  BrowserFailure,
  BrowserResponseStatus,
} from "@anlg/assistant/browser-context";

const MAX_MESSAGE = 768 * 1024;

function failure(error: BrowserFailure, message?: unknown) {
  const id =
    message && typeof message === "object" && "request_id" in message
      ? message.request_id
      : undefined;
  console.error(
    JSON.stringify({
      event: "browser_native_relay_failed",
      run_id: crypto.randomUUID(),
      reason: error,
    }),
  );
  return {
    version: BROWSER_PROTOCOL_VERSION,
    request_id: typeof id === "string" && id.length <= 128 ? id : "",
    result: { status: BrowserResponseStatus.Error, error },
  };
}

const discoverySchema = z.object({
  version: z.literal(1),
  host_path: z.string(),
  url: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        !!url.port &&
        url.pathname === "/" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.string().regex(/^chrome-extension:\/\/[a-p]{32}\/$/),
});

export async function relayNativeMessage(
  origin: string,
  hostPath: string,
  message: unknown,
) {
  const candidates = ["com.hyprnote.stable", "com.hyprnote.dev"].map((id) =>
    join(
      homedir(),
      "Library",
      "Application Support",
      id,
      "browser-bridge.json",
    ),
  );
  for (const path of candidates) {
    let config;
    try {
      config = discoverySchema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch {
      continue;
    }
    if (config.host_path !== hostPath) continue;
    if (config.origin !== origin)
      return failure(BrowserFailure.Unauthorized, message);
    try {
      const response = await fetch(`${config.url}/browser`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(
          message &&
            typeof message === "object" &&
            "operation" in message &&
            (message.operation as { kind?: string })?.kind === "record"
            ? 40_000
            : 5_000,
        ),
        redirect: "error",
      });
      if (response.status === 401)
        return failure(BrowserFailure.Unauthorized, message);
      if (!response.ok) return failure(BrowserFailure.InvalidMessage, message);
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_MESSAGE)
        return failure(BrowserFailure.InvalidMessage, message);
      return JSON.parse(body) as unknown;
    } catch {
      return failure(BrowserFailure.AppUnavailable, message);
    }
  }
  return failure(BrowserFailure.AppUnavailable, message);
}

export async function nativeMessages(
  input: AsyncIterable<Uint8Array>,
  write: (frame: Uint8Array) => Promise<void>,
  relay: (message: unknown) => Promise<unknown>,
) {
  let buffered = Buffer.alloc(0);
  let handled = 0;
  const started = performance.now();
  const runId = crypto.randomUUID();
  console.error(
    JSON.stringify({
      event: "browser_native_connection_started",
      run_id: runId,
    }),
  );
  const respond = async (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_MESSAGE)
      throw new Error("Native response exceeds message limit");
    const frame = Buffer.allocUnsafe(body.length + 4);
    frame.writeUInt32LE(body.length);
    body.copy(frame, 4);
    await write(frame);
  };
  try {
    for await (const chunk of input) {
      // Consume a chunk incrementally so a malformed length cannot grow the buffer.
      let offset = 0;
      while (offset < chunk.length) {
        const target = buffered.length < 4 ? 4 : 4 + buffered.readUInt32LE(0);
        const count = Math.min(target - buffered.length, chunk.length - offset);
        buffered = Buffer.concat([
          buffered,
          chunk.subarray(offset, offset + count),
        ]);
        offset += count;
        if (buffered.length < 4) continue;
        const length = buffered.readUInt32LE(0);
        if (!length || length > MAX_MESSAGE)
          throw new Error("Invalid native message length");
        if (buffered.length !== length + 4) continue;
        let message: unknown;
        try {
          message = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              buffered.subarray(4),
            ),
          );
        } catch {
          await respond(failure(BrowserFailure.InvalidMessage));
          buffered = Buffer.alloc(0);
          continue;
        }

        const response = await relay(message);
        await respond(response);
        handled++;
        buffered = Buffer.alloc(0);
      }
    }
    if (buffered.length) throw new Error("Truncated native message");
    console.error(
      JSON.stringify({
        event: "browser_native_connection_completed",
        run_id: runId,
        requests: handled,
        duration_ms: Math.round(performance.now() - started),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "browser_native_connection_failed",
        run_id: runId,
        requests: handled,
        duration_ms: Math.round(performance.now() - started),
      }),
    );
    throw error;
  }
}

export async function runNativeMessaging(origin: string) {
  if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin))
    throw new Error("Invalid native caller");
  await nativeMessages(
    process.stdin,
    (frame) =>
      new Promise<void>((resolve, reject) => {
        process.stdout.write(frame, (error) =>
          error ? reject(error) : resolve(),
        );
      }),
    (message) => relayNativeMessage(origin, process.execPath, message),
  );
}
