import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  endpoint: vi.fn(),
  fetch: vi.fn(),
  tab: { type: "sessions", id: "note-17" } as {
    type: string;
    id: string;
  } | null,
}));
vi.mock("@anlg/plugin-coach", () => ({
  commands: { assistantEndpoint: mocks.endpoint },
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ currentTab: mocks.tab }) },
}));

import { createAssistantHost } from "./host";

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("reconnects a fragmented answer to the restarted sidecar and sends the current note through authenticated native HTTP", async () => {
  mocks.endpoint
    .mockResolvedValueOnce({
      status: "ok",
      data: { url: "http://127.0.0.1:4747", token: "first" },
    })
    .mockResolvedValue({
      status: "ok",
      data: { url: "http://127.0.0.1:4848", token: "second" },
    });
  const requests: Array<{ url: string; token: string | null; body: unknown }> =
    [];
  let stream: ReadableStreamDefaultController<Uint8Array>;
  mocks.fetch.mockImplementation(async (url: URL, init: RequestInit) => {
    requests.push({
      url: url.href,
      token: new Headers(init.headers).get("authorization"),
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.pathname !== "/events") return new Response(null, { status: 204 });
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          init.signal?.addEventListener("abort", () => {
            try {
              controller.close();
            } catch {
              /* The first response has already ended. */
            }
          });
        },
      }),
    );
  });
  const host = createAssistantHost();
  const messages: string[] = [];
  const close = host.subscribe({
    open() {},
    error() {},
    message: (data) => messages.push(data),
  });
  try {
    await vi.waitFor(() =>
      expect(requests[0]?.url).toBe("http://127.0.0.1:4747/events"),
    );
    const encoder = new TextEncoder();
    stream!.enqueue(encoder.encode('data: {"type":"text","delta":"First'));
    stream!.enqueue(encoder.encode(' answer"}\n\ndata: {"type":"done"}\n\n'));
    await vi.waitFor(() =>
      expect(messages).toEqual([
        '{"type":"text","delta":"First answer"}',
        '{"type":"done"}',
      ]),
    );
    vi.useFakeTimers();
    stream!.close();
    await vi.advanceTimersByTimeAsync(1_501);
    expect(requests[1]).toEqual({
      url: "http://127.0.0.1:4848/events",
      token: "Bearer second",
      body: null,
    });
    await host.request("/ask", {
      method: "POST",
      body: JSON.stringify({ text: "Summarize this note" }),
    });
    expect(requests[2]).toEqual({
      url: "http://127.0.0.1:4848/ask",
      token: "Bearer second",
      body: { text: "Summarize this note", contextSessionId: "note-17" },
    });
    mocks.tab = null;
    await host.request("/ask", {
      method: "POST",
      body: JSON.stringify({ text: "Find last week's meetings" }),
    });
    expect(requests[3]?.body).toEqual({
      text: "Find last week's meetings",
      contextSessionId: null,
    });
  } finally {
    close();
  }
});
