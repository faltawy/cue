import { act, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "bun:test";

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

test("releasing before capture starts appends to the editable draft and waits for explicit Send", async () => {
  const started = deferred<Response>();
  let recording = "";
  let submitted: string | null = null;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === "start") {
      recording = body.recording_id;
      return started.promise;
    }
    if (body.action === "stop" && body.recording_id === recording)
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
  const mic = view.getByRole("button", { name: "Hold to dictate" });
  Object.defineProperty(mic, "setPointerCapture", { value: () => {} });
  fireEvent.pointerDown(mic, { button: 0, pointerId: 1 });
  expect(
    (view.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.pointerUp(mic, { pointerId: 1 });
  await user.clear(input);
  await user.type(input, "Edited draft");
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
    if (body.action === "start") activeId = body.recording_id;
    if (body.action === "stop") return stopped.promise;
    if (body.action === "cancel") cancelId = body.recording_id;
    return Response.json({ text: null });
  }) as typeof fetch;
  const view = render(<Composer {...props()} />);
  const input = view.getByRole("textbox") as HTMLTextAreaElement;
  const user = userEvent.setup({ document });
  await user.type(input, "Keep this");
  const mic = view.getByRole("button", { name: "Hold to dictate" });
  await act(async () => {
    fireEvent.keyDown(mic, { key: " " });
  });
  await act(async () => {
    fireEvent.keyUp(mic, { key: " " });
  });
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

test.each(["blur", "reset", "unmount"] as const)(
  "%s abandons pending capture and cancels again when its delayed start completes",
  async (reason) => {
    const started = deferred<Response>();
    const cancelled: Array<{ id: string; keepalive: boolean | undefined }> = [];
    let recordingId = "";
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.action === "start") {
        recordingId = body.recording_id;
        return started.promise;
      }
      if (body.action === "cancel")
        cancelled.push({ id: body.recording_id, keepalive: init?.keepalive });
      return Response.json({
        text: body.action === "stop" ? "Must not reach this draft" : null,
      });
    }) as typeof fetch;
    const view = render(<Composer {...props()} dictationOwner={0} />);
    const user = userEvent.setup({ document });
    await user.type(view.getByRole("textbox"), "Preserve my draft");
    fireEvent.keyDown(view.getByRole("button", { name: "Hold to dictate" }), {
      key: "Enter",
    });
    expect(view.getByRole("status").textContent).toContain("Listening");
    if (reason === "blur") fireEvent.blur(window);
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
