import { describe, expect, test } from "bun:test";

import { classifyError, coachError, SIGN_IN_STEPS, StderrTail, withSignIn } from "./errors";

describe("classifyError", () => {
  test.each([
    ["Failed to authenticate. API Error: 401 OAuth token has expired", "auth"],
    ["Invalid API key · Please run /login", "auth"],
    ["API Error: 429 rate_limit_error", "rate_limit"],
    ["Claude AI usage limit reached|1792000000", "rate_limit"],
    ["API Error: 529 Overloaded", "network"],
    ["fetch failed: getaddrinfo ENOTFOUND api.anthropic.com", "network"],
    ["Connection error.", "network"],
    ["error_max_turns", "other"],
  ] as const)("%s → %s", (message, kind) => {
    expect(classifyError({ message })).toBe(kind);
  });

  test("the SDK's own error tag wins over the wording", () => {
    expect(classifyError({ message: "something odd happened", sdkError: "rate_limit" })).toBe("rate_limit");
    expect(classifyError({ message: "something odd happened" })).toBe("other");
  });

  test("a 401 quoted from a tool's output is not a sign-in problem", () => {
    expect(classifyError({ message: "Tool Bash said: curl returned 401 Unauthorized" })).toBe("other");
    expect(classifyError({ message: "401 Unauthorized" })).toBe("auth");
  });
});

describe("coachError", () => {
  test("names the problem in plain words and keeps the raw text and Claude Code's stderr as details", () => {
    const error = coachError({ message: "Claude Code exited unexpectedly.", stderr: "Error: Invalid API key\n" });
    expect(error.kind).toBe("auth");
    expect(error.title).toBe("Sign-in expired");
    expect(error.message).not.toContain("Terminal");
    expect(error.detail).toBe(
      `${SIGN_IN_STEPS}\n\nClaude Code exited unexpectedly.\n\nClaude Code: Error: Invalid API key`,
    );
    expect(coachError({ message: "Overloaded" }).detail).toBe("Overloaded");
  });
});

describe("withSignIn", () => {
  const expired = coachError({ message: "Not logged in · Please run /login" });

  test("an auth failure with nobody signed in asks to sign in, not to sign in again", () => {
    const signedOut = withSignIn(expired, false);
    expect(signedOut.title).toBe("Sign in to Claude");
    expect(signedOut.signedOut).toBe(true);
    expect(withSignIn(expired, true).title).toBe("Sign-in expired");
    expect(withSignIn(expired, null).title).toBe("Sign-in expired");
    expect(withSignIn(coachError({ message: "Overloaded" }), false).title).toBe("Couldn't reach Claude");
  });
});

describe("StderrTail", () => {
  test("keeps only the newest output and empties on take", () => {
    const tail = new StderrTail(10);
    tail.push("0123456789");
    tail.push("abc");
    expect(tail.take()).toBe("3456789abc");
    expect(tail.take()).toBe("");
  });
});
