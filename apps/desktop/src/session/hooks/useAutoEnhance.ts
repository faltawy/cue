import { useEffect, useState } from "react";

import { toast } from "@anlg/ui/components/ui/toast";
import { SessionNoteViewType } from "@anlg/utils/session";
import { SummaryEligibilitySkipCode } from "@anlg/utils/summary-eligibility";

import { getEnhancerService } from "~/services/enhancer";
import { EnhancerEventType } from "~/services/enums";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function useAutoEnhance(tab: Extract<Tab, { type: TabType.Sessions }>) {
  const sessionId = tab.id;
  const [skipReason, setSkipReason] = useState<string | null>(null);

  useEffect(() => {
    const service = getEnhancerService();
    if (!service) return;
    return service.on((event) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === EnhancerEventType.AutoEnhanceSkipped) {
        setSkipReason(event.reason);
        if (
          event.reasonCode === SummaryEligibilitySkipCode.TranscriptTooShort
        ) {
          toast.warning("Summary wasn't generated", {
            id: `auto-summary-too-short-${sessionId}`,
            description: event.reason,
          });
        }
      }
      if (event.type === EnhancerEventType.AutoEnhanceStarted) {
        const tabsState = useTabs.getState();
        const sessionTab = tabsState.tabs.find(
          (t): t is Extract<Tab, { type: TabType.Sessions }> =>
            t.type === TabType.Sessions && t.id === sessionId,
        );
        if (
          sessionTab &&
          sessionTab.state.view?.type !== SessionNoteViewType.Transcript
        ) {
          tabsState.updateSessionTabState(sessionTab, {
            ...sessionTab.state,
            view: { type: SessionNoteViewType.Enhanced, id: event.noteId },
          });
        }
      }
      if (event.type === EnhancerEventType.AutoEnhanceNoModel) {
        setSkipReason("No AI model configured");
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (skipReason) {
      const timer = setTimeout(() => setSkipReason(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [skipReason]);

  return { skipReason };
}
