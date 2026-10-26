import { CoachProvider, providerName } from "./provider";

export enum CoachErrorAction {
  NewChat = "new_chat",
}

export enum CoachErrorKind {
  Auth = "auth",
  RateLimit = "rate_limit",
  Network = "network",
  Other = "other",
}

export type CoachError = {
  kind: CoachErrorKind;
  title: string;
  message: string;
  detail: string | null;
  action?: CoachErrorAction.NewChat;
  signedOut?: boolean;
};

export const GAVE_UP = {
  title: "The coach stopped",
  message:
    "It failed to restart several times in a row. Start a new chat to try again.",
  action: CoachErrorAction.NewChat,
} satisfies Partial<CoachError>;

const KIND_SIGNATURES: Array<{ kind: CoachErrorKind; pattern: RegExp }> = [
  {
    kind: CoachErrorKind.Auth,
    pattern:
      /\bnot logged in\b|\bmissing bearer\b|\bauthentication required\b/i,
  },
  { kind: CoachErrorKind.Auth, pattern: /\binvalid x-api-key\b/i },
  { kind: CoachErrorKind.Auth, pattern: /\binvalid api key\b/i },
  { kind: CoachErrorKind.Auth, pattern: /\bauthentication[_ ]error\b/i },
  { kind: CoachErrorKind.Auth, pattern: /\bno auth credentials\b/i },
  { kind: CoachErrorKind.Auth, pattern: /\bunauthorized\b/i },
  { kind: CoachErrorKind.Auth, pattern: /\bfailed to authenticate\b/i },
  {
    kind: CoachErrorKind.Auth,
    pattern: /\boauth\b.{0,80}\b(expired|revoked|invalid|refresh)/i,
  },
  {
    kind: CoachErrorKind.Auth,
    pattern: /\b(token|session)\b.{0,40}\bexpired\b/i,
  },
  { kind: CoachErrorKind.Auth, pattern: /\bplease run \/login\b/i },
  { kind: CoachErrorKind.RateLimit, pattern: /\brate.?limit/i },
  { kind: CoachErrorKind.RateLimit, pattern: /\b429\b/ },
  { kind: CoachErrorKind.RateLimit, pattern: /\btoo many requests\b/i },
  { kind: CoachErrorKind.RateLimit, pattern: /\bquota\b/i },
  { kind: CoachErrorKind.RateLimit, pattern: /\busage limit\b/i },
  { kind: CoachErrorKind.Network, pattern: /\boverloaded\b/i },
  { kind: CoachErrorKind.Network, pattern: /\b50[023]\b/ },
  { kind: CoachErrorKind.Network, pattern: /\bservice unavailable\b/i },
  { kind: CoachErrorKind.Network, pattern: /\binternal server error\b/i },
  { kind: CoachErrorKind.Network, pattern: /\bECONN(RESET|REFUSED)\b/ },
  {
    kind: CoachErrorKind.Network,
    pattern: /\bETIMEDOUT\b|\bENOTFOUND\b|\bEAI_AGAIN\b/,
  },
  { kind: CoachErrorKind.Network, pattern: /\bfetch failed\b/i },
  { kind: CoachErrorKind.Network, pattern: /\bconnection error\b/i },
];

const SDK_ERROR_KINDS: Record<string, CoachErrorKind | undefined> = {
  authentication_failed: CoachErrorKind.Auth,
  oauth_org_not_allowed: CoachErrorKind.Auth,
  rate_limit: CoachErrorKind.RateLimit,
  overloaded: CoachErrorKind.Network,
  server_error: CoachErrorKind.Network,
};

export function classifyError(input: {
  message: string;
  sdkError?: string;
}): CoachErrorKind {
  const tagged = input.sdkError ? SDK_ERROR_KINDS[input.sdkError] : undefined;
  if (tagged) return tagged;
  if (input.message.startsWith("Tool ")) return CoachErrorKind.Other;
  return (
    KIND_SIGNATURES.find(({ pattern }) => pattern.test(input.message))?.kind ??
    CoachErrorKind.Other
  );
}

const COPY: Record<CoachErrorKind, { title: string; message: string }> = {
  auth: {
    title: "Sign-in expired",
    message: "Your session timed out.",
  },
  rate_limit: {
    title: "Usage limit reached",
    message:
      "Claude is limiting requests right now. Wait a moment, or check your plan's usage, then retry.",
  },
  network: {
    title: "Couldn't reach Claude",
    message:
      "Check your connection and retry. Claude may also be briefly overloaded.",
  },
  other: {
    title: "The coach hit an error",
    message: "Retry the question. If it keeps failing, start a new chat.",
  },
};

export const SIGN_IN_STEPS =
  "To sign in yourself: open Terminal, run `claude`, then type `/login`.";

const DETAIL_MAX = 2_000;

export function coachError(input: {
  message: string;
  provider?: CoachProvider;
  sdkError?: string;
  stderr?: string;
}): CoachError {
  const kind = classifyError({
    message: [input.message, input.stderr ?? ""].join("\n"),
    ...(input.sdkError ? { sdkError: input.sdkError } : {}),
  });
  const stderr = input.stderr?.trim();
  const raw = [input.message.trim(), stderr ? `Claude Code: ${stderr}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const detail = [
    kind === CoachErrorKind.Auth ? SIGN_IN_STEPS : "",
    raw.slice(-DETAIL_MAX),
  ]
    .filter(Boolean)
    .join("\n\n");
  return errorForProvider(
    { kind, ...COPY[kind], detail: detail || null },
    input.provider ?? CoachProvider.Claude,
  );
}

// "Sign-in expired" is wrong for someone who never signed in; Claude Code's auth status tells the two apart.
export function errorForProvider(
  error: CoachError,
  provider: CoachProvider,
): CoachError {
  if (provider === CoachProvider.Claude) return error;
  return {
    ...error,
    title: error.title.replaceAll("Claude", "Codex"),
    message: error.message.replaceAll("Claude", "Codex"),
    detail:
      error.detail
        ?.replace(SIGN_IN_STEPS, "Sign in to Codex in Settings → AI.")
        .replaceAll("Claude Code", "Codex") ?? null,
  };
}

export function withSignIn(
  error: CoachError,
  signedIn: boolean | null,
  provider: CoachProvider = CoachProvider.Claude,
): CoachError {
  error = errorForProvider(error, provider);
  if (error.kind !== CoachErrorKind.Auth || signedIn !== false) return error;
  return {
    ...error,
    title: `Sign in to ${providerName(provider)}`,
    message:
      provider === CoachProvider.Codex
        ? "Sign in to Codex for Cue in Settings → AI."
        : "The coach uses the Claude sign-in on this Mac.",
    signedOut: true,
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
