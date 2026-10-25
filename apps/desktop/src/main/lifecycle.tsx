import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { useLanguageModel } from "~/ai/hooks";
import { openWhatsNewAfterUpdate } from "~/changelog/whats-new";
import { CoachDictationLifecycle } from "~/coach/dictation-lifecycle";
import { CoachNudgeLifecycle } from "~/coach/nudges";
import { CoachShortcutLifecycle } from "~/coach/shortcut";
import { SelfNameBackfill } from "~/contacts/self-name";
import { DictationLifecycle } from "~/dictation/lifecycle";
import { DictationOverlay } from "~/dictation/panel";
import { takePendingWelcomeSession } from "~/onboarding/welcome-note";
import { initEnhancerService } from "~/services/enhancer";
import { useConfigValue } from "~/shared/config";
import { useDesktopTabLifecycle } from "~/shared/desktop-tab-lifecycle";
import { useTabs } from "~/store/zustand/tabs";
import { BatchTranscriptionRecovery } from "~/stt/batch-transcription-recovery";
import { LiveCaptureRecovery } from "~/stt/live-capture-recovery";
import { ScheduledMeetingAutoStart } from "~/stt/scheduled-auto-start";
import { MainListenerControlBridge } from "~/stt/window-control";

export function useClassicMainLifecycle() {
  const openNew = useTabs((state) => state.openNew);

  const openDefaultEmptyTab = useCallback(() => {
    openNew({ type: "empty" });
  }, [openNew]);

  const openInitialTabs = useCallback(() => {
    const welcomeSessionId = takePendingWelcomeSession();
    if (welcomeSessionId) {
      openNew({ type: "sessions", id: welcomeSessionId });
    }
    void openWhatsNewAfterUpdate(openNew).catch((error) => {
      console.error("[whats-new] failed to check for an update", error);
    });
  }, [openNew]);

  useDesktopTabLifecycle({
    onEmpty: openDefaultEmptyTab,
    onInitialized: openInitialTabs,
    onZeroTabs: openDefaultEmptyTab,
  });
}

export function ClassicMainServices() {
  return (
    <>
      <LiveCaptureRecovery />
      <BatchTranscriptionRecovery />
      <ScheduledMeetingAutoStart />
      <MainListenerControlBridge />
      <DictationLifecycle />
      <DictationOverlay />
      <CoachShortcutLifecycle />
      <CoachNudgeLifecycle />
      <CoachDictationLifecycle />
      <SelfNameBackfill />
      <EnhancerInit />
    </>
  );
}

function EnhancerInit() {
  const { aiTaskStore } = useRouteContext({
    from: "__root__",
  });

  const model = useLanguageModel();
  const selectedTemplateId = useConfigValue("selected_template_id");

  const modelRef = useRef(model);
  modelRef.current = model;
  const templateIdRef = useRef(selectedTemplateId);
  templateIdRef.current = selectedTemplateId;

  useEffect(() => {
    if (!aiTaskStore) return;

    const service = initEnhancerService({
      aiTaskStore,
      getModel: () => modelRef.current,
      getSelectedTemplateId: () => templateIdRef.current || undefined,
    });

    return () => service.dispose();
  }, [aiTaskStore]);

  return null;
}
