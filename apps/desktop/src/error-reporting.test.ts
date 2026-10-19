import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureOperationalError,
  installGlobalErrorLogging,
  reportCaughtReactError,
} from "./error-reporting";

describe("local error logging", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("logs operational errors with the operation and original error", () => {
    const error = new Error("disk full");

    captureOperationalError(error, { operation: "note_save" });

    expect(consoleError).toHaveBeenCalledWith("[note_save] failed", error);
  });

  it("appends tags and context when provided", () => {
    const error = new Error("launch failed");

    captureOperationalError(error, {
      operation: "integration_open",
      tags: { integration: "zoom" },
      context: { enabled: true },
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[integration_open] failed",
      error,
      { integration: "zoom", enabled: true },
    );
  });

  it("logs errors caught by React", () => {
    const error = new TypeError("bad render");

    reportCaughtReactError(error);

    expect(consoleError).toHaveBeenCalledWith(
      "[react] caught render error",
      error,
    );
  });

  it("logs uncaught errors and unhandled rejections", () => {
    installGlobalErrorLogging();
    const error = new Error("boom");
    const reason = new Error("rejected");

    window.dispatchEvent(
      Object.assign(new Event("error"), { error, message: "boom" }),
    );
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason }),
    );

    expect(consoleError).toHaveBeenCalledWith("[window] uncaught error", error);
    expect(consoleError).toHaveBeenCalledWith(
      "[window] unhandled promise rejection",
      reason,
    );
  });
});
