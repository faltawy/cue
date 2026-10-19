import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const command =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push(args.length ? `${name}:${JSON.stringify(args[0])}` : name);
      return mocks.failing === name
        ? { status: "error" as const, error: `${name} failed` }
        : { status: "ok" as const, data: null };
    };
  return {
    calls,
    failing: null as string | null,
    commands: {
      show: command("show"),
      hide: command("hide"),
      setPhase: command("setPhase"),
      setPreview: command("setPreview"),
      updateAmplitude: command("updateAmplitude"),
    },
  };
});
vi.mock("@anlg/plugin-dictation", () => ({ commands: mocks.commands }));

import {
  createDictationOverlaySynchronizer,
  getDictationOverlayState,
  waitForDictationPanel,
} from "./panel";
import { useDictationStatus } from "./state";

const overlay = (
  owner: string,
  overrides: Partial<
    NonNullable<ReturnType<typeof getDictationOverlayState>>
  > = {},
) => ({
  owner,
  phase: "recording" as const,
  amplitude: 0,
  preview: "",
  ...overrides,
});

describe("dictation panel readiness", () => {
  beforeEach(() =>
    useDictationStatus.setState(useDictationStatus.getInitialState()),
  );

  it("waits for this recording's panel before allowing microphone capture", async () => {
    const ready = vi.fn();
    const promise = waitForDictationPanel(
      "current",
      new AbortController().signal,
    ).then(ready);
    useDictationStatus.setState({ presentedOwner: "previous" });
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    useDictationStatus.setState({ presentedOwner: "current" });
    await promise;
    expect(ready).toHaveBeenCalledOnce();
  });

  it("rejects cancellation while the panel is opening", async () => {
    const abort = new AbortController();
    const promise = waitForDictationPanel("current", abort.signal);
    abort.abort();
    await expect(promise).rejects.toThrow("cancelled");
    useDictationStatus.setState({ presentedOwner: "current" });
  });
});

describe("dictation overlay", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.failing = null;
  });

  it("shows the words heard so far and finishes as processing", () => {
    expect(
      getDictationOverlayState({
        ...useDictationStatus.getInitialState(),
        phase: "recording",
        owner: "a",
        amplitude: 0.4,
        text: "Hello",
        partial: "there",
      }),
    ).toEqual(overlay("a", { amplitude: 0.4, preview: "Hello there" }));
    expect(
      getDictationOverlayState({
        ...useDictationStatus.getInitialState(),
        phase: "transcribing",
        owner: "a",
        amplitude: 0.4,
        text: "Hello",
      }),
    ).toEqual(overlay("a", { phase: "processing", preview: "Hello" }));
    expect(
      getDictationOverlayState({
        ...useDictationStatus.getInitialState(),
        owner: "a",
      }),
    ).toBeNull();
  });

  it("sets a new recording's state before showing it, then reports it presented", async () => {
    const presented = vi.fn();
    const synchronizer = createDictationOverlaySynchronizer(presented);

    synchronizer.update(overlay("a", { preview: "Hi" }));

    await vi.waitFor(() => expect(presented).toHaveBeenCalledWith("a"));
    expect(mocks.calls).toEqual([
      'setPhase:"recording"',
      'setPreview:"Hi"',
      "updateAmplitude:0",
      "show",
    ]);
  });

  it("skips to the latest state and hides once dictation ends", async () => {
    const presented = vi.fn();
    const synchronizer = createDictationOverlaySynchronizer(presented);

    synchronizer.update(overlay("a"));
    synchronizer.update(overlay("a", { amplitude: 0.2 }));
    synchronizer.update(overlay("a", { amplitude: 0.6, preview: "Hey" }));
    await vi.waitFor(() => expect(presented).toHaveBeenLastCalledWith("a"));
    synchronizer.update(null);
    await vi.waitFor(() => expect(presented).toHaveBeenLastCalledWith(null));

    expect(mocks.calls).toEqual([
      'setPhase:"recording"',
      'setPreview:""',
      "updateAmplitude:0",
      "show",
      'setPreview:"Hey"',
      "updateAmplitude:0.6",
      "hide",
    ]);
  });

  it("settles when presenting feeds the unchanged state straight back", async () => {
    let state: ReturnType<typeof overlay> | null = null;
    let feedbacks = 0;
    const synchronizer = createDictationOverlaySynchronizer(() => {
      if (feedbacks++ < 50) synchronizer.update(state && { ...state });
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    synchronizer.update(null);
    await settle();
    expect(feedbacks).toBe(0);

    state = overlay("a", { preview: "Hi" });
    synchronizer.update(state);
    await settle();
    expect(feedbacks).toBe(1);
    expect(mocks.calls.filter((call) => call === "show")).toHaveLength(1);
  });

  it("never reports an overlay that failed to show as presented", async () => {
    mocks.failing = "show";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const presented = vi.fn();
    const synchronizer = createDictationOverlaySynchronizer(presented);

    synchronizer.update(overlay("a"));

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(mocks.calls).toContain("show");
    expect(presented).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
