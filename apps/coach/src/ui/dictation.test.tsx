import { act, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "bun:test";

import { DictationAction } from "../app-bridge";
import { Composer } from "./components/composer";
import { useDom } from "./dom-setup";
import { status } from "./fixtures";

useDom();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function props() {
  return {
    busy: false,
    ready: true,
    placeholder: "Ask",
    status: status(),
    chips: [],
    onSubmit: async () => true,
    onStop() {},
    recall: () => null,
    onChooseFolder() {},
    onDefaultFolder() {},
    onChooseProject() {},
  };
}

test("clicking starts capture until a second click, even before startup, and only appends to the draft", async () => {
  const started = deferred<Response>();
  let recording = "";
  let submitted: string | null = null;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === DictationAction.Start) {
      recording = body.recording_id;
      return started.promise;
    }
    if (body.action === DictationAction.Stop && body.recording_id === recording)
      return Response.json({ text: "new words" });
    throw new Error("Unexpected dictation command");
  }) as typeof fetch;
  const view = render(
    <Composer
      {...props()}
      onSubmit={async (text) => {
        submitted = text;
        return true;
      }}
    />,
  );
  const input = view.getByRole("textbox") as HTMLTextAreaElement;
  const user = userEvent.setup({ document });
  await user.type(input, "My draft");
  const mic = view.getByRole("button", { name: /dictat/i });
  await user.click(mic);
  expect(
    (view.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.blur(window);
  await user.clear(input);
  await user.type(input, "Edited draft");
  expect(view.getByRole("status").textContent).toContain("Listening");
  await user.click(mic);
  await act(async () => {
    started.resolve(Response.json({ text: null }));
  });
  await waitFor(() => expect(input.value).toBe("Edited draft new words"));
  expect(submitted).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(submitted).toBe("Edited draft new words"));
});

test("Escape cancels a pending transcription and a late result cannot replace later typing", async () => {
  const stopped = deferred<Response>();
  let cancelId = "";
  let activeId = "";
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === DictationAction.Start) activeId = body.recording_id;
    if (body.action === DictationAction.Stop) return stopped.promise;
    if (body.action === DictationAction.Cancel) cancelId = body.recording_id;
    return Response.json({ text: null });
  }) as typeof fetch;
  const view = render(<Composer {...props()} />);
  const input = view.getByRole("textbox") as HTMLTextAreaElement;
  const user = userEvent.setup({ document });
  await user.type(input, "Keep this");
  const mic = view.getByRole("button", { name: /dictat/i });
  act(() => mic.focus());
  await user.keyboard("{Enter}");
  expect(view.getByRole("status").textContent).toContain("Listening");
  await user.keyboard(" ");
  expect(view.getByRole("status").textContent).toContain("Transcribing");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(activeId).toMatch(/^[a-f0-9-]{36}$/);
  expect(cancelId).toBe(activeId);
  await user.type(input, " and my edits");
  await act(async () => {
    stopped.resolve(Response.json({ text: "discard these words" }));
  });
  expect(input.value).toBe("Keep this and my edits");
});

test("a coach question arriving during capture leaves stop available", async () => {
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(init?.body as string);
    return Response.json({
      text: body.action === DictationAction.Stop ? "Help me answer this" : null,
    });
  }) as typeof fetch;
  const view = render(<Composer {...props()} busy />);
  const user = userEvent.setup({ document });
  await user.click(view.getByRole("button", { name: /dictat/i }));
  expect(view.getByRole("status").textContent).toContain("Listening");
  view.rerender(<Composer {...props()} above={<p>Which project?</p>} />);
  await user.click(view.getByRole("button", { name: /dictat/i }));
  await waitFor(() =>
    expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Help me answer this",
    ),
  );
});

test.each(["pagehide", "reset", "unmount"] as const)(
  "%s abandons pending capture and cancels again when its delayed start completes",
  async (reason) => {
    const started = deferred<Response>();
    const cancelled: Array<{ id: string; keepalive: boolean | undefined }> = [];
    let recordingId = "";
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.action === DictationAction.Start) {
        recordingId = body.recording_id;
        return started.promise;
      }
      if (body.action === DictationAction.Cancel)
        cancelled.push({ id: body.recording_id, keepalive: init?.keepalive });
      return Response.json({
        text:
          body.action === DictationAction.Stop
            ? "Must not reach this draft"
            : null,
      });
    }) as typeof fetch;
    const view = render(<Composer {...props()} dictationOwner={0} />);
    const user = userEvent.setup({ document });
    await user.type(view.getByRole("textbox"), "Preserve my draft");
    fireEvent.click(view.getByRole("button", { name: /dictat/i }));
    expect(view.getByRole("status").textContent).toContain("Listening");
    if (reason === "pagehide") fireEvent(window, new Event("pagehide"));
    else if (reason === "reset")
      view.rerender(<Composer {...props()} dictationOwner={1} />);
    else view.unmount();
    expect(recordingId).toMatch(/^[a-f0-9-]{36}$/);
    expect(cancelled.at(-1)).toEqual({ id: recordingId, keepalive: true });
    const firstCancel = cancelled.at(-1);
    await act(async () => {
      started.resolve(Response.json({ text: null }));
      await started.promise;
    });
    expect(cancelled.at(-1)).not.toBe(firstCancel);
    expect(cancelled.at(-1)).toEqual({ id: recordingId, keepalive: true });
    if (reason !== "unmount")
      expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "Preserve my draft",
      );
  },
);
