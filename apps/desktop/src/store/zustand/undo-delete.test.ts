import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUndoDelete } from "./undo-delete";

describe("useUndoDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUndoDelete.setState({ pendingDeletions: {} });
  });

  afterEach(() => {
    for (const pending of Object.values(
      useUndoDelete.getState().pendingDeletions,
    )) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
    }
    useUndoDelete.setState({ pendingDeletions: {} });
    vi.useRealTimers();
  });

  it("removes a deleted note's files only after the 10 second undo window", () => {
    const removeFiles = vi.fn();
    useUndoDelete.getState().addDeletion(
      {
        session: { id: "session-1", title: "Design sync" },
        tombstone: "tombstone",
        deletedAt: Date.now(),
      },
      removeFiles,
    );

    vi.advanceTimersByTime(9_999);
    expect(removeFiles).not.toHaveBeenCalled();
    expect(useUndoDelete.getState().pendingDeletions["session-1"]).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(removeFiles).toHaveBeenCalledOnce();
    expect(useUndoDelete.getState().pendingDeletions["session-1"]).toBeUndefined();
  });
});
