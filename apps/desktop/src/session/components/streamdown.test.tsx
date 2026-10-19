import { cleanup, render } from "@testing-library/react";
import { Streamdown } from "streamdown";
import { afterEach, describe, expect, it } from "vitest";

import { streamdownComponents } from "./streamdown";

afterEach(() => {
  cleanup();
});

function renderMarkdown(markdown: string) {
  return render(
    <Streamdown components={streamdownComponents} isAnimating={false}>
      {markdown}
    </Streamdown>,
  ).container;
}

describe("summary text direction", () => {
  it("lays out Arabic blocks right-to-left and English ones left-to-right", () => {
    const container = renderMarkdown(
      [
        "## ملخص الاجتماع",
        "",
        "هل تم حل مشكلة الجلسات المفتوحة؟",
        "",
        "Sessions stayed open on WhatsApp.",
        "",
        "> العميل طلب نسخة مخفية",
      ].join("\n"),
    );

    expect(container.querySelector("h2")?.getAttribute("dir")).toBe("rtl");
    const paragraphs = Array.from(container.querySelectorAll("p")).filter(
      (p) => !p.closest("blockquote"),
    );
    expect(paragraphs.map((p) => p.getAttribute("dir"))).toEqual(["rtl", "ltr"]);
    expect(container.querySelector("blockquote")?.getAttribute("dir")).toBe("rtl");
  });

  it("gives each list item the direction of its own first letter", () => {
    const container = renderMarkdown(
      ["- متابعة مع **العميل**", "- Send the Bcc steps", "- 3 رسائل via WhatsApp"].join("\n"),
    );

    expect(
      Array.from(container.querySelectorAll("li")).map((li) => li.getAttribute("dir")),
    ).toEqual(["rtl", "ltr", "rtl"]);
  });
});
