import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { NativeClient } from "./native-client";
import { Operation } from "./protocol";

test("native requests correlate out-of-order replies and disconnect rejects only unresolved work", async () => {
  const posted: { request_id: string }[] = [];
  let receive: (message: unknown) => void = () => {};
  const port = {
    postMessage: (message: { request_id: string }) => posted.push(message),
    onMessage: {
      addListener: (listener: typeof receive) => {
        receive = listener;
      },
    },
    onDisconnect: { addListener() {} },
    disconnect() {},
  } as unknown as chrome.runtime.Port;
  const client = new NativeClient("com.hyprnote.stable.browser", () => port);
  const first = client.request({ kind: Operation.Status });
  const second = client.request({ kind: Operation.Status });
  receive({
    version: 1,
    request_id: posted[1]!.request_id,
    result: {
      status: "ok",
      reply: { kind: "status", active_session_id: "second" },
    },
  });
  expect(await second).toEqual({
    kind: Operation.Status,
    active_session_id: "second",
  });
  const rejected = rejects(first, /Disconnected during test/);
  client.close("Disconnected during test");
  await rejected;
});

test("a disconnected host can reconnect without late messages breaking the new connection", async () => {
  const connections: {
    receive(message: unknown): void;
    disconnect(): void;
    requestId: string;
  }[] = [];
  const client = new NativeClient("com.hyprnote.stable.browser", () => {
    const connection = {
      receive: (_message: unknown) => {},
      disconnect: () => {},
      requestId: "",
    };
    connections.push(connection);
    return {
      postMessage: (message: { request_id: string }) => {
        connection.requestId = message.request_id;
      },
      onMessage: {
        addListener: (listener: typeof connection.receive) => {
          connection.receive = listener;
        },
      },
      onDisconnect: {
        addListener: (listener: () => void) => {
          connection.disconnect = listener;
        },
      },
      disconnect() {},
    } as unknown as chrome.runtime.Port;
  });
  const interrupted = rejects(client.request({ kind: Operation.Status }), {
    code: "CUE_HOST_NOT_FOUND",
  });
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: { message: "Specified native messaging host not found." },
      },
    },
  });
  try {
    connections[0]!.disconnect();
  } finally {
    if (originalChrome)
      Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
  await interrupted;
  const retried = client.request({ kind: Operation.Status });
  connections[0]!.receive({ broken: true });
  connections[0]!.disconnect();
  connections[1]!.receive({
    version: 1,
    request_id: connections[1]!.requestId,
    result: {
      status: "ok",
      reply: { kind: "status", active_session_id: "restarted" },
    },
  });
  expect(await retried).toEqual({
    kind: Operation.Status,
    active_session_id: "restarted",
  });
  client.close();
});
