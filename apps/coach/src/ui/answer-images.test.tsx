import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { CoachMarkdown } from "@anlg/assistant/ui/components/markdown";

import { useDom } from "./dom-setup";

useDom();

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(text: string) {
  return render(<CoachMarkdown text={text} />);
}

describe("images in answers", () => {
  test("a project screenshot loads through the coach, framed, with its alt text as the caption", () => {
    const view = answer(
      "Here's the flow:\n\n![Sign-up flow, step 3](docs/flow.png)",
    );
    const image = view.getByRole("img", { name: "Sign-up flow, step 3" });
    expect(image.getAttribute("src")).toBe("/file?path=docs%2Fflow.png");
    expect(
      view.getByText("Sign-up flow, step 3", { selector: "figcaption, span" }),
    ).toBeTruthy();
  });

  test("clicking a project image asks the coach to open the file itself, since a browser has no coach session", () => {
    const opened = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = opened as unknown as typeof fetch;
    const view = answer("![Architecture](/work/northwind/docs/arch.png)");
    fireEvent.click(
      view.getByRole("button", { name: "Open Architecture full size" }),
    );
    expect(opened).toHaveBeenCalledTimes(1);
    const [url, init] = opened.mock.calls[0] ?? [];
    expect(url).toBe("/open-image");
    expect(JSON.parse(String(init?.body))).toEqual({
      path: "/work/northwind/docs/arch.png",
    });
  });

  test("a web image is not fetched until asked for", () => {
    const view = answer(
      "![Their logo](https://cdn.northwind.example.com/logo.png)",
    );
    expect(view.queryByRole("img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    const load = view.getByRole("button", {
      name: /Image from cdn\.northwind\.example\.com/,
    });
    fireEvent.click(load);
    expect(
      view.getByRole("img", { name: "Their logo" }).getAttribute("src"),
    ).toBe("https://cdn.northwind.example.com/logo.png");
  });

  test.each([
    ["plain http", "http://tracker.example.com/pixel.gif"],
    ["a data URL", "data:image/png;base64,iVBORw0KGgo="],
    ["a file URL", "file:///etc/passwd"],
    ["javascript", "javascript:alert(1)"],
  ])("%s never renders or loads", (_name, src) => {
    const view = answer(`![pixel](${src})`);
    expect(document.querySelector("img")).toBeNull();
    expect(view.queryByRole("button", { name: /Image from/ })).toBeNull();
    expect(view.getByText(/pixel/)).toBeTruthy();
  });

  test("an image that fails to load says so instead of showing a broken icon", () => {
    const view = answer("![Missing chart](docs/missing.png)");
    fireEvent.error(view.getByRole("img", { name: "Missing chart" }));
    expect(view.queryByRole("img", { name: "Missing chart" })).toBeNull();
    expect(view.getByText(/Couldn't load/)).toBeTruthy();
  });
});
