import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FolderPathLabel, splitFolderPath } from "./folder-path-label";

describe("splitFolderPath", () => {
  it.each([
    ["Hiring", { parent: "", leaf: "Hiring" }],
    ["Clients/Lumen", { parent: "Clients", leaf: "/Lumen" }],
    [
      "Clients/Northwind Industries/Enterprise onboarding — Q4 2026",
      {
        parent: "Clients/Northwind Industries",
        leaf: "/Enterprise onboarding — Q4 2026",
      },
    ],
  ])("splits %s", (path, expected) => {
    expect(splitFolderPath(path)).toEqual(expected);
  });
});

describe("FolderPathLabel", () => {
  it("keeps the whole path readable and laid out in its own direction", () => {
    const { container } = render(
      <>
        <FolderPathLabel path="Clients/Lumen" />
        <FolderPathLabel path="عملاء/شركة جسر" />
        <FolderPathLabel path="Hiring" />
      </>,
    );
    const [latin, arabic, single] = [...container.children];

    expect(screen.getByText("Clients/Lumen")).toBeTruthy();
    expect(latin?.getAttribute("title")).toBe("Clients/Lumen");
    expect(latin?.getAttribute("dir")).toBe("ltr");
    expect(
      [...(latin?.querySelectorAll("[aria-hidden]") ?? [])].map(
        (half) => half.textContent,
      ),
    ).toEqual(["Clients", "/Lumen"]);
    expect(arabic?.getAttribute("dir")).toBe("rtl");
    expect(single?.textContent).toBe("Hiring");
  });
});
