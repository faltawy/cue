import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";

export type CoachErrorKind = "auth" | "rate_limit" | "network" | "other";

export type CoachError = {
  kind: CoachErrorKind;
  title: string;
  message: string;
  detail: string | null;
  action?: "new_chat";
};

export const GAVE_UP = {
  title: "The coach stopped",
  message: "It failed to restart several times in a row. Start a new chat to try again.",
  action: "new_chat",
} satisfies Partial<CoachError>;

const KIND_SIGNATURES: Array<{ kind: CoachErrorKind; pattern: RegExp }> = [
  { kind: "auth", pattern: /\binvalid x-api-key\b/i },
  { kind: "auth", pattern: /\binvalid api key\b/i },
  { kind: "auth", pattern: /\bauthentication[_ ]error\b/i },
  { kind: "auth", pattern: /\bno auth credentials\b/i },
  { kind: "auth", pattern: /\bunauthorized\b/i },
  { kind: "auth", pattern: /\bfailed to authenticate\b/i },
  { kind: "auth", pattern: /\boauth\b.{0,80}\b(expired|revoked|invalid|refresh)/i },
  { kind: "auth", pattern: /\b(token|session)\b.{0,40}\bexpired\b/i },
  { kind: "auth", pattern: /\bplease run \/login\b/i },
  { kind: "rate_limit", pattern: /\brate.?limit/i },
  { kind: "rate_limit", pattern: /\b429\b/ },
  { kind: "rate_limit", pattern: /\btoo many requests\b/i },
  { kind: "rate_limit", pattern: /\bquota\b/i },
  { kind: "rate_limit", pattern: /\busage limit\b/i },
  { kind: "network", pattern: /\boverloaded\b/i },
  { kind: "network", pattern: /\b50[023]\b/ },
  { kind: "network", pattern: /\bservice unavailable\b/i },
  { kind: "network", pattern: /\binternal server error\b/i },
  { kind: "network", pattern: /\bECONN(RESET|REFUSED)\b/ },
  { kind: "network", pattern: /\bETIMEDOUT\b|\bENOTFOUND\b|\bEAI_AGAIN\b/ },
  { kind: "network", pattern: /\bfetch failed\b/i },
  { kind: "network", pattern: /\bconnection error\b/i },
];

const SDK_ERROR_KINDS: Partial<Record<SDKAssistantMessageError, CoachErrorKind>> & Record<string, CoachErrorKind | undefined> = {
  authentication_failed: "auth",
  oauth_org_not_allowed: "auth",
  rate_limit: "rate_limit",
  overloaded: "network",
  server_error: "network",
};

export function classifyError(input: { message: string; sdkError?: string }): CoachErrorKind {
  const tagged = input.sdkError ? SDK_ERROR_KINDS[input.sdkError] : undefined;
  if (tagged) return tagged;
  if (input.message.startsWith("Tool ")) return "other";
  return KIND_SIGNATURES.find(({ pattern }) => pattern.test(input.message))?.kind ?? "other";
}

const COPY: Record<CoachErrorKind, { title: string; message: string }> = {
  auth: {
    title: "Sign-in expired",
    message: "Your session timed out.",
  },
  rate_limit: {
    title: "Usage limit reached",
    message: "Claude is limiting requests right now. Wait a moment, or check your plan's usage, then retry.",
  },
  network: {
    title: "Couldn't reach Claude",
    message: "Check your connection and retry. Claude may also be briefly overloaded.",
  },
  other: {
    title: "The coach hit an error",
    message: "Retry the question. If it keeps failing, start a new chat.",
  },
};

export const SIGN_IN_STEPS = "To sign in yourself: open Terminal, run `claude`, then type `/login`.";

const DETAIL_MAX = 2_000;

export function coachError(input: {
  message: string;
  sdkError?: string;
  stderr?: string;
}): CoachError {
  const kind = classifyError({
    message: [input.message, input.stderr ?? ""].join("\n"),
    ...(input.sdkError ? { sdkError: input.sdkError } : {}),
  });
  const stderr = input.stderr?.trim();
  const raw = [input.message.trim(), stderr ? `Claude Code: ${stderr}` : ""].filter(Boolean).join("\n\n");
  const detail = [kind === "auth" ? SIGN_IN_STEPS : "", raw.slice(-DETAIL_MAX)].filter(Boolean).join("\n\n");
  return {
    kind,
    ...COPY[kind],
    detail: detail || null,
  };
}

export class StderrTail {
  private text = "";

  constructor(private readonly max = DETAIL_MAX) {}

  push(chunk: string) {
    this.text = (this.text + chunk).slice(-this.max);
  }

  take(): string {
    const text = this.text;
    this.text = "";
    return text;
  }
}
