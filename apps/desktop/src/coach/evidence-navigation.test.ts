import { beforeEach, describe, expect, test } from "vitest";

import { openCoachEvidence, useCoachEvidenceTarget } from "./evidence-navigation";
import { useTabs } from "~/store/zustand/tabs";
import { createSessionTab, resetTabsStore } from "~/store/zustand/tabs/test-utils";

describe("coach evidence navigation", () => {
  beforeEach(() => {
    resetTabsStore();
    useCoachEvidenceTarget.setState({ target: null });
  });

  test("opens the cited meeting's transcript without starting capture or switching to an unrelated meeting", () => {
    useTabs.getState().openNew(createSessionTab({ id: "other-session" }));
    const target = { sessionId: "source-session", timestampMs: 760_000 };

    openCoachEvidence(target);

    expect(useTabs.getState().currentTab).toMatchObject({
      type: "sessions",
      id: "source-session",
      state: { view: { type: "transcript" }, autoStart: null },
    });
    expect(
      useTabs
        .getState()
        .tabs.some(
          (tab) => tab.type === "sessions" && tab.id === "other-session",
        ),
    ).toBe(true);
    expect(useCoachEvidenceTarget.getState().target).toEqual(target);
  });
});
