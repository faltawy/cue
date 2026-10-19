import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMainContentCenterOffset } from "./content-offset";

function placeElement(
  attribute: string,
  left: number,
  width: number,
  value = "",
) {
  const element = document.createElement("div");
  element.setAttribute(attribute, value);
  element.getBoundingClientRect = () => new DOMRect(left, 0, width, 600);
  document.body.append(element);
}

describe("useMainContentCenterOffset", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("centers on the main body, not on the left sidebar's resizable panel", () => {
    window.innerWidth = 1000;
    placeElement("data-testid", 0, 1000, "main-app-shell");
    placeElement("data-panel-id", 0, 240);
    placeElement("data-main-body-panel-container", 240, 760);

    const { result } = renderHook(() => useMainContentCenterOffset(true));

    expect(result.current).toBe(120);
  });

  it("shifts only as far as keeps a dialog of the given width inside a narrow window", () => {
    window.innerWidth = 700;
    placeElement("data-main-body-panel-container", 200, 500);

    const { result: wide } = renderHook(() =>
      useMainContentCenterOffset(true, 300),
    );
    const { result: narrow } = renderHook(() =>
      useMainContentCenterOffset(true, 576),
    );

    expect(wide.current).toBe(100);
    expect(narrow.current).toBe(62);
  });

  it("falls back to the window center when the main body is not mounted", () => {
    window.innerWidth = 1000;
    placeElement("data-testid", 0, 1000, "main-app-shell");
    placeElement("data-panel-id", 0, 240);

    const { result } = renderHook(() => useMainContentCenterOffset(true));

    expect(result.current).toBe(0);
  });
});
