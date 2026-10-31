import { StrictMode, useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";

import { MeetingIntent } from "@anlg/assistant/coaching-preferences";
import {
  type CoachEvent,
  CoachEventType,
  TurnKind,
} from "@anlg/assistant/protocol";
import { CoachView } from "@anlg/assistant/ui/app";
import {
  AssistantHostProvider,
  AssistantScope,
  AssistantSurface,
} from "@anlg/assistant/ui/host";
import { ActionType, reduce } from "@anlg/assistant/ui/state";
import { type CoachApi } from "@anlg/assistant/ui/use-coach";

import { fixtureState, isScenario } from "../../coach/src/ui/fixtures";
import {
  hostChannel,
  useHostLayout,
  usePublishConnected,
} from "../src/panel/host-layout";
import { MeetPanel } from "../src/panel/meet-panel";
import { ConnectionState } from "../src/protocol";
import { connectedState, panelFixture, PanelScenario } from "./fixtures";

const params = new URLSearchParams(location.search);
const scenario = params.get("coach") ?? "coaching";
const post = hostChannel(location.origin, true);

const host = {
  surface: AssistantSurface.Embedded,
  scope: AssistantScope.Meeting,
  request: async () => new Response(null, { status: 204 }),
  subscribe: () => () => undefined,
};

function answer(text: string): CoachEvent[] {
  return [
    { type: CoachEventType.User, kind: TurnKind.Ask, text },
    {
      type: CoachEventType.Text,
      delta: `Preview answer for **${text}**. In a real call the coach reads the transcript first.`,
    },
    {
      type: CoachEventType.Done,
      seconds: 1.4,
      ok: true,
      silent: false,
      interrupted: false,
    },
  ];
}

function Preview() {
  const [state, setState] = useState(() => panelFixture(params.get("panel")));
  const [coach, dispatch] = useReducer(
    (current: ReturnType<typeof fixtureState>, events: CoachEvent[]) =>
      events.reduce(
        (next, event) => reduce(next, { type: ActionType.Event, event }),
        current,
      ),
    undefined,
    () => {
      const state = fixtureState(isScenario(scenario) ? scenario : "coaching");
      // A live meeting with a coaching session, so the / meeting tools are on.
      return state.status?.meeting
        ? reduce(state, {
            type: ActionType.Event,
            event: {
              ...state.status,
              coaching: {
                sessionId: "preview",
                intent: MeetingIntent.General,
                quiet: false,
              },
            },
          })
        : state;
    },
  );
  const [debug, setDebug] = useState(false);
  const [layout, changeLayout] = useHostLayout(location.origin, true);
  const connected = state.connection === ConnectionState.Connected;
  usePublishConnected(post, connected);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setState((current) => ({
          ...current,
          appLink: { ...current.appLink, checkedAt: Date.now() },
        })),
      5_000,
    );
    return () => clearInterval(timer);
  }, []);

  const ok = async () => ({ ok: true as const });
  const api: CoachApi = {
    ask: async (text) => {
      dispatch(answer(text));
      return { ok: true };
    },
    checkIn: async () => {
      dispatch(answer("Catch me up"));
      return { ok: true };
    },
    checkItem: ok,
    addItemToNote: ok,
    open: ok,
    openEvidence: ok,
    feedback: ok,
    resetFeedback: ok,
    setCoaching: ok,
    stop: ok,
    newChat: ok,
    answer: ok,
    dismiss: ok,
    undo: ok,
    chooseSeriesFolder: ok,
    useDefaultFolder: ok,
    addActionItems: ok,
    logToClients: ok,
    signIn: ok,
    chooseProjectFolder: ok,
    retrySetup: ok,
    notify: (message) => console.info("notice", message),
  };
  const connect = () => setState(connectedState());

  return (
    <MeetPanel
      state={state}
      embedded
      supportedTab
      showBackToMeeting={false}
      busy={false}
      failure={null}
      coachIssue={null}
      debugEnabled={debug}
      layout={layout}
      onLayout={changeLayout}
      actions={{
        connect,
        disconnect: () => setState(panelFixture(PanelScenario.Idle)),
        refresh: () => undefined,
        focusMeeting: () => undefined,
        confirmRecording: connect,
        dismissRecording: () => setState(panelFixture(PanelScenario.Idle)),
        screens: (screens) => setState((current) => ({ ...current, screens })),
        testHighlight: () => undefined,
        testAttention: () => undefined,
        setDebug,
        exportDebug: () => undefined,
        clearDebug: () => undefined,
      }}
      renderCoach={(slot) => (
        <AssistantHostProvider host={host}>
          <CoachView state={coach} api={api} {...slot} />
        </AssistantHostProvider>
      )}
    />
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
