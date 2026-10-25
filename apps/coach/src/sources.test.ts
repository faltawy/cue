import { describe, expect, test } from "bun:test";

import {
  type FoundSource,
  pickSources,
  SourceKind,
  SOURCES_MAX,
  sourcesFromTool,
} from "./sources";
import { TurnTracker } from "./turn-events";

const webSearch = {
  query: "Northwind Industries Bcc CRM dropbox",
  results: [
    "I'll search for that.",
    {
      tool_use_id: "srvtoolu_01",
      content: [
        {
          title: "Outbound Bcc addresses · Help Center",
          url: "https://help.example.com/email/outbound-bcc?utm_source=search",
          snippet: "Every reply sent from the inbox copies each address…",
        },
        {
          title: "Northwind Industries — About",
          url: "https://www.northwind.example.com/about/",
        },
        { title: "Tracking pixel", url: "javascript:alert(1)" },
        { title: "Local file", url: "file:///etc/passwd" },
      ],
    },
  ],
  durationSeconds: 1.4,
};

const webFetch = (url: string, code = 200) => ({
  bytes: 48_211,
  code,
  codeText: code === 200 ? "OK" : "Not Found",
  result: "The page says Bcc applies to every reply sent from the inbox.",
  durationMs: 820,
  url,
});

const mcpText = (value: unknown) => [
  { type: "text", text: JSON.stringify(value) },
];

const gmailSearch = mcpText({
  threads: [
    {
      id: "18f2a9c4b7e1d3a0",
      messages: [
        {
          id: "18f2a9c4b7e1d3a0",
          subject: "Re: Bcc on every reply before the Q4 renewal",
          sender:
            "Aleksandra Wiśniewska-Kowalczyk <aleksandra@northwind.example.com>",
          snippet: "We lost two renewals because nobody saw the thread…",
          date: "2026-10-14T09:12:00Z",
        },
      ],
      viewUrl: "https://mail.google.com/mail/u/1/#all/18f2a9c4b7e1d3a0",
    },
    {
      id: "18f2b0d1e2f3a4b5",
      messages: [
        {
          id: "18f2b0d1e2f3a4b5",
          subject: "",
          sender: "Jo <jo@northwind.example.com>",
        },
      ],
    },
    { id: "../../evil", messages: [{ subject: "not a thread id" }] },
  ],
  nextPageToken: "abc",
});

describe("sources from tool results", () => {
  test("web search hits and fetched pages become chips named by their domain, with only web links kept", () => {
    expect(sourcesFromTool("WebSearch", webSearch)).toEqual([
      {
        kind: SourceKind.Web,
        url: "https://help.example.com/email/outbound-bcc?utm_source=search",
        label: "help.example.com",
        title:
          "Outbound Bcc addresses · Help Center\nhttps://help.example.com/email/outbound-bcc?utm_source=search",
      },
      {
        kind: SourceKind.Web,
        url: "https://www.northwind.example.com/about/",
        label: "northwind.example.com",
        title:
          "Northwind Industries — About\nhttps://www.northwind.example.com/about/",
      },
    ]);
    expect(
      sourcesFromTool("WebFetch", webFetch("https://docs.example.com/bcc")),
    ).toEqual([
      {
        kind: SourceKind.Web,
        url: "https://docs.example.com/bcc",
        label: "docs.example.com",
        title: "https://docs.example.com/bcc",
      },
    ]);
    expect(
      sourcesFromTool(
        "WebFetch",
        webFetch("https://docs.example.com/missing", 404),
      ),
    ).toEqual([]);
  });

  test("Gmail threads open in Gmail: its own link when it gives one, else the thread id; subjects name the chip", () => {
    expect(
      sourcesFromTool("mcp__claude_ai_Gmail__search_threads", gmailSearch),
    ).toEqual([
      {
        kind: SourceKind.Email,
        url: "https://mail.google.com/mail/u/1/#all/18f2a9c4b7e1d3a0",
        label: "Re: Bcc on every reply before the Q4 renewal",
        title:
          "Re: Bcc on every reply before the Q4 renewal\nAleksandra Wiśniewska-Kowalczyk <aleksandra@northwind.example.com>",
      },
      {
        kind: SourceKind.Email,
        url: "https://mail.google.com/mail/u/0/#all/18f2b0d1e2f3a4b5",
        label: "(no subject)",
        title: "(no subject)\nJo <jo@northwind.example.com>",
      },
    ]);
    const message = {
      content: mcpText({
        id: "m1",
        threadId: "18f2c1c1c1c1c1c1",
        subject: "Pricing sheet",
        viewUrl: "javascript:alert(1)",
      }),
    };
    expect(
      sourcesFromTool("mcp__claude_ai_Gmail_2__get_message", message),
    ).toMatchObject([
      {
        kind: "email",
        url: "https://mail.google.com/mail/u/0/#all/18f2c1c1c1c1c1c1",
        label: "Pricing sheet",
      },
    ]);
  });

  test("other tools and unreadable results give no sources", () => {
    expect(
      sourcesFromTool("Read", { file: { filePath: "/work/a.md" } }),
    ).toEqual([]);
    expect(
      sourcesFromTool("mcp__claude_ai_Gmail__search_threads", "not json"),
    ).toEqual([]);
    expect(sourcesFromTool("mcp__clients__brief", gmailSearch)).toEqual([]);
  });
});

describe("picking which sources to show", () => {
  test("drops duplicates, puts links the answer cites and pages it read before search hits, and keeps five", () => {
    const hit = (
      index: number,
      url = `https://site${index}.example.com/page`,
      direct = false,
    ): FoundSource => ({
      kind: SourceKind.Web,
      url,
      label: `site${index}.example.com`,
      title: `Page ${index}`,
      direct,
    });
    const hits = Array.from({ length: 8 }, (_, index) => hit(index));
    const picked = pickSources(
      [
        ...hits,
        hit(6, "https://site6.example.com/page/", true),
        hit(0, "https://site0.example.com/page#top"),
      ],
      "Per site7.example.com/page, Bcc applies to every reply.",
    );
    expect(picked.map((source) => source.url)).toEqual([
      "https://site7.example.com/page",
      "https://site6.example.com/page",
      "https://site0.example.com/page",
      "https://site1.example.com/page",
      "https://site2.example.com/page",
    ]);
    expect(picked).toHaveLength(SOURCES_MAX);
  });

  test("a turn reports the sources its web and email lookups used, once, and the next turn starts clean", () => {
    const tracker = new TurnTracker();
    tracker.beginTurn();
    tracker.hookResult("t1", webSearch, "WebSearch");
    tracker.hookResult(
      "t2",
      webFetch("https://help.example.com/email/outbound-bcc?utm_source=search"),
      "WebFetch",
    );
    tracker.hookResult(
      "t3",
      gmailSearch,
      "mcp__claude_ai_Gmail__search_threads",
    );
    tracker.hookResult("t4", [{ type: "text", text: "# README" }], "Read");
    const done = {
      type: "result",
      subtype: "success",
      is_error: false,
      usage: {},
      modelUsage: {},
      total_cost_usd: 0,
    };
    const outcome = tracker.finishTurn(done, {
      interrupted: false,
      stderr: "",
    });
    expect(
      outcome.sources.map((source) => [source.kind, source.label]),
    ).toEqual([
      ["web", "help.example.com"],
      ["email", "Re: Bcc on every reply before the Q4 renewal"],
      ["email", "(no subject)"],
      ["web", "northwind.example.com"],
    ]);
    tracker.beginTurn();
    expect(
      tracker.finishTurn(done, { interrupted: false, stderr: "" }).sources,
    ).toEqual([]);
  });
});
