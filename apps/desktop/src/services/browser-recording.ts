import { LiveSessionStatus } from "~/store/zustand/listener/enums";
import { listenerStore } from "~/store/zustand/listener/instance";
import { useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";
import { registerBrowserRecordingDeadline } from "~/stt/browser-recording-deadline";

export function startBrowserRecording(sessionId: string, expiresAt: number) {
  if (expiresAt <= Date.now()) return;
  registerBrowserRecordingDeadline(sessionId, expiresAt);
  let opened = false;
  let finished = false;
  let unsubscribe = () => {};
  const cleanup = () => {
    finished = true;
    clearTimeout(timer);
    unsubscribe();
  };
  const timer = setTimeout(() => {
    cleanup();
    const tabs = useTabs.getState();
    for (const tab of tabs.tabs) {
      if (tab.type === TabType.Sessions && tab.id === sessionId)
        tabs.updateSessionTabState(tab, {
          ...tab.state,
          autoStart: false,
          scheduledAutoStart: null,
        });
    }
    const listener = listenerStore.getState();
    if (
      listener.live.sessionId === sessionId &&
      listener.live.status !== LiveSessionStatus.Active
    )
      listener.stop();
    console.warn("browser_recording_start_expired", { session_id: sessionId });
  }, expiresAt - Date.now());
  const advance = () => {
    if (finished || Date.now() >= expiresAt) return;
    const listener = listenerStore.getState();
    if (
      listener.live.sessionId === sessionId &&
      listener.live.status === LiveSessionStatus.Active
    ) {
      cleanup();
      return;
    }
    if (!opened && listener.canStartLiveSession(sessionId)) {
      opened = true;
      useTabs.getState().openNew({
        type: TabType.Sessions,
        id: sessionId,
        state: { view: null, autoStart: true, scheduledAutoStart: null },
      });
    }
  };
  unsubscribe = listenerStore.subscribe(advance);
  advance();
}
