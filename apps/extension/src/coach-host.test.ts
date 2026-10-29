import { expect, test } from "bun:test";

import { createCoachHost } from "./coach-host";

test("meeting chat streams from the same coach and stops sending after detachment", async () => {
  const credential = "a".repeat(64);
  const received: string[] = [];
  const cues: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      if (request.headers.get("authorization") !== `Bearer ${credential}`)
        return new Response(null, { status: 401 });
      if (new URL(request.url).pathname === "/browser-coach/events")
        return new Response(
          'data: {"type":"status"}\n\ndata: {"type":"attention","attention":{"id":"caf6c345-04be-4f74-96f8-85274d7ce4ae","target":"coach","line":"Confirm the owner","expiresAt":9999999999999,"automatic":true}}\n\ndata: {"type":"text","text":"Fresh reply"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      received.push(await request.text());
      return new Response(null, { status: 204 });
    },
  });
  const previous = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      sendMessage: async () => ({
        kind: "coach",
        url: `${server.url.origin}/browser-coach`,
        token: credential,
      }),
    },
  } as unknown as typeof chrome;
  const connection = createCoachHost("attached-generation", fetch, (cue) =>
    cues.push(cue.line),
  );
  let unsubscribe = () => {};
  try {
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("No coach stream")),
        1000,
      );
      unsubscribe = connection.host.subscribe({
        open() {},
        error() {},
        message(data) {
          events.push(data);
          if (events.length === 2) {
            clearTimeout(timeout);
            resolve();
          }
        },
      });
    });
    expect(cues).toEqual(["Confirm the owner"]);
    expect(events).toEqual([
      '{"type":"status"}',
      '{"type":"text","text":"Fresh reply"}',
    ]);
    expect(
      (
        await connection.host.request("/ask", {
          method: "POST",
          body: '{"text":"Catch me up"}',
        })
      ).status,
    ).toBe(204);
    await expect(
      connection.host.request("//example.com/steal"),
    ).rejects.toThrow("Invalid coach path");
    connection.close();
    await expect(
      connection.host.request("/ask", {
        method: "POST",
        body: '{"text":"Stale request"}',
      }),
    ).rejects.toThrow();
    expect(received).toEqual(['{"text":"Catch me up"}']);
  } finally {
    unsubscribe();
    connection.close();
    globalThis.chrome = previous;
    server.stop(true);
  }
});
