// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { EditorView } from "prosemirror-view";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { JSONContent } from "./index";
import { NoteEditor } from "./index";

afterEach(() => {
  cleanup();
});

const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const title: JSONContent = {
  type: "heading",
  attrs: { level: 1 },
  content: [{ type: "text", text: "Weekly sync" }],
};

async function renderNote(content: JSONContent[]) {
  let view: EditorView | null = null;
  const rendered = render(
    createElement(NoteEditor, {
      initialContent: { type: "doc", content: [title, ...content] },
      handleChange: () => {},
      onViewReady: (nextView) => {
        view = nextView;
      },
    }),
  );
  await waitFor(() => expect(view).not.toBeNull());
  const surface = rendered.container.querySelector<HTMLElement>(".ProseMirror");
  if (!surface) throw new Error("editor surface not rendered");
  return {
    surface,
    view: () => {
      if (!view) throw new Error("editor view not ready");
      return view;
    },
  };
}

describe("text direction in notes", () => {
  it("lays out Arabic blocks right-to-left and English blocks left-to-right", async () => {
    const { surface } = await renderNote([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "ملخص الاجتماع" }] },
      paragraph("هل تم حل مشكلة الجلسات المفتوحة؟"),
      paragraph("Sessions stayed open on WhatsApp."),
      { type: "blockquote", content: [paragraph("العميل طلب نسخة مخفية")] },
    ]);

    expect(surface.querySelector("h2")?.getAttribute("dir")).toBe("rtl");
    const [arabic, english] = Array.from(surface.querySelectorAll(":scope > p"));
    expect(arabic?.getAttribute("dir")).toBe("rtl");
    expect(english?.getAttribute("dir")).toBe("ltr");
    expect(surface.querySelector("blockquote")?.getAttribute("dir")).toBe("rtl");
  });

  it("resolves a mixed line by its first letter, skipping digits and punctuation", async () => {
    const { surface } = await renderNote([
      paragraph("3. Bcc عنوان في الإعدادات"),
      paragraph("— ٣ رسائل via WhatsApp"),
    ]);

    const [english, arabic] = Array.from(surface.querySelectorAll(":scope > p"));
    expect(english?.getAttribute("dir")).toBe("ltr");
    expect(arabic?.getAttribute("dir")).toBe("rtl");
  });

  it("puts list markers on the Arabic side: list and task items take their own direction", async () => {
    const { surface } = await renderNote([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [paragraph("متابعة مع العميل")] },
          { type: "listItem", content: [paragraph("Send the Bcc steps")] },
        ],
      },
      {
        type: "taskList",
        content: [{ type: "taskItem", attrs: { status: "todo" }, content: [paragraph("إرسال الخطوات")] }],
      },
    ]);

    const [arabicItem, englishItem] = Array.from(surface.querySelectorAll("ul:not([data-type]) > li"));
    expect(arabicItem?.getAttribute("dir")).toBe("rtl");
    expect(englishItem?.getAttribute("dir")).toBe("ltr");
    expect(surface.querySelector('li[data-type="taskItem"]')?.getAttribute("dir")).toBe("rtl");
  });

  it("follows the text as it is typed and leaves empty blocks to inherit", async () => {
    const { surface, view } = await renderNote([{ type: "paragraph" }]);
    const block = () => surface.querySelector(":scope > p");
    const paragraphStart = () => view().state.doc.child(0).nodeSize + 1;
    expect(block()?.hasAttribute("dir")).toBe(false);

    act(() => {
      view().dispatch(view().state.tr.insertText("مرحبا", paragraphStart()));
    });
    await waitFor(() => expect(block()?.getAttribute("dir")).toBe("rtl"));

    act(() => {
      const { state } = view();
      view().dispatch(state.tr.insertText("Hello ", paragraphStart()));
    });
    await waitFor(() => expect(block()?.getAttribute("dir")).toBe("ltr"));
  });
});
