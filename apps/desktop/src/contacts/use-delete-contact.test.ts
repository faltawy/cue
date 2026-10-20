import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  softDeleteContact: vi.fn(),
  restoreContact: vi.fn(),
  message: vi.fn(),
  error: vi.fn(),
  invalidateResource: vi.fn(),
}));

vi.mock("@anlg/plugin-calendar", () => ({
  commands: {
    softDeleteContact: mocks.softDeleteContact,
    restoreContact: mocks.restoreContact,
  },
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  toast: { message: mocks.message, error: mocks.error },
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: { invalidateResource: () => void }) => unknown,
  ) => selector({ invalidateResource: mocks.invalidateResource }),
}));

import { useDeleteContact } from "./use-delete-contact";

describe("useDeleteContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.softDeleteContact.mockResolvedValue({
      status: "ok",
      data: "2026-10-20T10:00:00.000Z",
    });
    mocks.restoreContact.mockResolvedValue({ status: "ok", data: true });
  });

  it("offers a 10 second undo that restores exactly the deleted contact", async () => {
    const { result } = renderHook(() => useDeleteContact());

    result.current("human", "human-1", "Ada Lovelace");

    await waitFor(() => expect(mocks.message).toHaveBeenCalledOnce());
    const [label, options] = mocks.message.mock.calls[0];
    expect(label).toBe("Ada Lovelace deleted");
    expect(options.duration).toBe(10_000);
    expect(mocks.restoreContact).not.toHaveBeenCalled();

    options.action.onClick();

    await waitFor(() =>
      expect(mocks.restoreContact).toHaveBeenCalledWith({
        kind: "human",
        contact_id: "human-1",
        tombstone: "2026-10-20T10:00:00.000Z",
      }),
    );
    expect(mocks.error).not.toHaveBeenCalled();
  });

});
