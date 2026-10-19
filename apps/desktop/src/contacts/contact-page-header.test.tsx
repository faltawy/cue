import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ContactPageHeader } from "./contact-page-header";

afterEach(cleanup);

it("hides mutation options for your own contact", () => {
  render(
    <ContactPageHeader
      title="Me"
      compactIdentity={null}
      showCompactIdentity={false}
      pinned
      readOnly
      onTogglePin={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Contact options" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Me" })).not.toBeNull();
});
