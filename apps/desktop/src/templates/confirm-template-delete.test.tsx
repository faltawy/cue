import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useConfirmTemplateDelete } from "./confirm-template-delete";

function Harness({
  onConfirm,
  onReady,
}: {
  onConfirm: (id: string) => Promise<void>;
  onReady: (requestDelete: (id: string) => void) => void;
}) {
  const { requestDelete, dialog } = useConfirmTemplateDelete(
    [{ id: "template-1", title: "Weekly sync" }],
    onConfirm,
  );
  onReady(requestDelete);
  return dialog;
}

describe("useConfirmTemplateDelete", () => {
  afterEach(cleanup);

  it("deletes a template only after the user confirms", () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    let requestDelete: (id: string) => void = () => {};
    render(
      <Harness
        onConfirm={onConfirm}
        onReady={(request) => {
          requestDelete = request;
        }}
      />,
    );

    act(() => requestDelete("template-1"));

    expect(screen.getByText("Delete “Weekly sync”?")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("template-1");
  });
});
