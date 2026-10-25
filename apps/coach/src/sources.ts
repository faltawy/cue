import { GMAIL_SERVER } from "./guard";

export enum SourceKind {
  Web = "web",
  Email = "email",
}

export type Source = {
  kind: SourceKind;
  url: string;
  label: string;
  title: string;
};

export const SOURCES_MAX = 5;
const LABEL_MAX = 80;
const GMAIL_HOST = "mail.google.com";
const THREAD_ID = /^[A-Za-z0-9_-]{6,64}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > LABEL_MAX
    ? `${flat.slice(0, LABEL_MAX - 1).trimEnd()}…`
    : flat;
}

function webUrl(value: unknown): URL | null {
  const text = str(value);
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function domain(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

function webSource(rawUrl: unknown, rawTitle: unknown): Source | null {
  const url = webUrl(rawUrl);
  if (!url) return null;
  const title = str(rawTitle);
  return {
    kind: SourceKind.Web,
    url: url.href,
    label: domain(url),
    title: title ? `${clip(title)}\n${url.href}` : url.href,
  };
}

function fromWebSearch(response: unknown): Source[] {
  const results = asRecord(response)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((result) => {
    const hits = asRecord(result)?.content;
    if (!Array.isArray(hits)) return [];
    return hits.flatMap((hit) => {
      const record = asRecord(hit);
      const source = record && webSource(record.url, record.title);
      return source ? [source] : [];
    });
  });
}

function fromWebFetch(response: unknown): Source[] {
  const record = asRecord(response);
  if (!record) return [];
  const code = typeof record.code === "number" ? record.code : 200;
  if (code >= 400) return [];
  const source = webSource(record.url, null);
  return source ? [source] : [];
}

function payloads(response: unknown): unknown[] {
  if (typeof response === "string") {
    try {
      return [JSON.parse(response)];
    } catch {
      return [];
    }
  }
  if (Array.isArray(response)) {
    return response.flatMap((part) => {
      const record = asRecord(part);
      return record?.type === "text" ? payloads(str(record.text)) : [];
    });
  }
  const record = asRecord(response);
  if (!record) return [];
  if (Array.isArray(record.content)) return payloads(record.content);
  return record.structuredContent ? [record.structuredContent] : [record];
}

function gmailUrl(threadId: string, viewUrl: unknown): string {
  const view = webUrl(viewUrl);
  if (view && view.protocol === "https:" && view.hostname === GMAIL_HOST)
    return view.href;
  return `https://${GMAIL_HOST}/mail/u/0/#all/${threadId}`;
}

function sender(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const record = asRecord(value);
  return record
    ? str(record.name) || str(record.email) || str(record.address)
    : "";
}

function emailSource(
  threadId: string,
  message: Record<string, unknown>,
  viewUrl: unknown,
): Source {
  const subject = clip(str(message.subject)) || "(no subject)";
  const from = sender(message.sender ?? message.from);
  return {
    kind: SourceKind.Email,
    url: gmailUrl(threadId, viewUrl),
    label: subject,
    title: from ? `${subject}\n${clip(from)}` : subject,
  };
}

function firstMessage(
  thread: Record<string, unknown>,
): Record<string, unknown> {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  return messages.map(asRecord).find((message) => message !== null) ?? thread;
}

function fromGmailValue(value: unknown, depth = 0): Source[] {
  if (depth > 6) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => fromGmailValue(item, depth + 1));
  const record = asRecord(value);
  if (!record) return [];
  if (Array.isArray(record.threads)) {
    return record.threads.flatMap((thread) => {
      const entry = asRecord(thread);
      const id = entry
        ? str(entry.id) || str(entry.threadId) || str(entry.thread_id)
        : "";
      return entry && THREAD_ID.test(id)
        ? [
            emailSource(
              id,
              firstMessage(entry),
              entry.viewUrl ?? entry.view_url,
            ),
          ]
        : [];
    });
  }
  const threadId =
    str(record.threadId) ||
    str(record.thread_id) ||
    (Array.isArray(record.messages) ? str(record.id) : "");
  if (THREAD_ID.test(threadId)) {
    return [
      emailSource(
        threadId,
        firstMessage(record),
        record.viewUrl ?? record.view_url,
      ),
    ];
  }
  return Object.values(record).flatMap((child) =>
    typeof child === "object" ? fromGmailValue(child, depth + 1) : [],
  );
}

export function sourcesFromTool(name: string, response: unknown): Source[] {
  if (name === "WebSearch") return fromWebSearch(response);
  if (name === "WebFetch") return fromWebFetch(response);
  const [prefix, server = ""] = name.split("__");
  if (prefix === "mcp" && GMAIL_SERVER.test(server))
    return payloads(response).flatMap((payload) => fromGmailValue(payload));
  return [];
}

function key(source: Source): string {
  if (source.kind === SourceKind.Email) return source.url;
  const url = new URL(source.url);
  url.hash = "";
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
}

function cited(source: Source, text: string): boolean {
  if (source.kind === SourceKind.Email) return false;
  const bare = source.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return text.includes(bare);
}

export type FoundSource = Source & { direct: boolean };

export function pickSources(
  found: readonly FoundSource[],
  answer: string,
  max = SOURCES_MAX,
): Source[] {
  const unique = new Map<string, FoundSource>();
  for (const source of found) {
    const id = key(source);
    const seen = unique.get(id);
    if (!seen) unique.set(id, source);
    else if (source.direct && !seen.direct)
      unique.set(id, { ...seen, direct: true });
  }
  const rank = (source: FoundSource) =>
    cited(source, answer) ? 0 : source.direct ? 1 : 2;
  return [...unique.values()]
    .map((source, order) => ({ source, order, rank: rank(source) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, max)
    .map(({ source: { kind, url, label, title } }) => ({
      kind,
      url,
      label,
      title,
    }));
}
