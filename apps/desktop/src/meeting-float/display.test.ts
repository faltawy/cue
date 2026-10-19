import { describe, expect, it } from "vitest";

import { getIslandDisplayOptions, getSelectedIslandDisplay } from "./display";

const builtIn = { id: "BUILTIN-UUID", name: "Built-in Display", hasCamera: true };
const mi = { id: "MI-UUID", name: "Mi Monitor", hasCamera: false };
const dell = { id: "DELL-UUID", name: "DELL U2723QE", hasCamera: false };

describe("Show on", () => {
  it("lists each connected display by name, marks the camera, then the pointer option", () => {
    expect(
      getIslandDisplayOptions([builtIn, mi], {
        camera: "camera",
        pointer: "Follow my pointer",
      }),
    ).toEqual([
      { value: "BUILTIN-UUID", label: "Built-in Display (camera)" },
      { value: "MI-UUID", label: "Mi Monitor" },
      { value: "pointer", label: "Follow my pointer" },
    ]);
  });

  it("shows the display the island will actually use", () => {
    expect(getSelectedIslandDisplay("MI-UUID", [builtIn, mi])).toBe("MI-UUID");
    expect(getSelectedIslandDisplay("pointer", [builtIn, mi])).toBe("pointer");
    expect(getSelectedIslandDisplay("camera", [mi, builtIn])).toBe(
      "BUILTIN-UUID",
    );
  });

  it("falls back to the camera, then the main display, when the chosen one is unplugged", () => {
    expect(getSelectedIslandDisplay("GONE-UUID", [mi, builtIn])).toBe(
      "BUILTIN-UUID",
    );
    expect(getSelectedIslandDisplay("GONE-UUID", [dell, mi])).toBe("DELL-UUID");
    expect(getSelectedIslandDisplay("camera", [])).toBe("camera");
  });
});
