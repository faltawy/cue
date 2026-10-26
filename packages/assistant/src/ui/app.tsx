import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProjectSource } from "../app-bridge";
import { BlockKind } from "../blocks";
import { CoachErrorKind } from "../errors";
import { type EvidenceTarget } from "../move";
import { SetupState, TurnKind, WrapUpState } from "../protocol";
import {
  Composer,
  type ComposerHandle,
  folderName,
} from "./components/composer";
import {
  CATCH_UP_SHORTCUT,
  Header,
  type HeaderSlot,
  TranscriptStrip,
} from "./components/header";
import { type Command, Palette } from "./components/palette";
import { QuestionPanel } from "./components/question-panel";
import { SetupFailed, setupLabel } from "./components/setup-notice";
import {
  EmptyState,
  Timeline,
  type TimelineActions,
} from "./components/timeline";
import {
  hasFollowUp,
  isEmptyWrapUp,
  WrapUpCard,
} from "./components/wrap-up-card";
import {
  AssistantHostProvider,
  AssistantSurface,
  browserHost,
  type AssistantHost,
  AssistantScope,
  useAssistantHost,
} from "./host";
import { type PreparedImage } from "./images";
import {
  chipsAllowed,
  type CoachState,
  Connection,
  isBusy,
  ItemKind,
  lastAsk,
  latestUndoable,
  meetingPhase,
  MeetingPhase,
  suggestions,
  type Turn,
} from "./state";
import { type CoachApi, useCoach } from "./use-coach";
import { useMountEffect } from "./use-mount-effect";

export const GLANCE_QUERY = "(max-height: 500px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function App({
  host = browserHost,
  header,
}: {
  host?: AssistantHost;
  header?: HeaderSlot;
}) {
  return (
    <AssistantHostProvider host={host}>
      <ConnectedAssistant header={header} />
    </AssistantHostProvider>
  );
}

function ConnectedAssistant({ header }: { header?: HeaderSlot }) {
  const [state, api] = useCoach();
  return <CoachView state={state} api={api} header={header} />;
}

export function CoachView({
  state,
  api,
  header,
}: {
  state: CoachState;
  api: CoachApi;
  header?: HeaderSlot;
}) {
  const host = useAssistantHost();
  const library = host.scope === AssistantScope.Library;
  const container = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState(false);
  const [sent, setSent] = useState(0);
  const glance = useMediaQuery(GLANCE_QUERY);
  const composer = useRef<ComposerHandle>(null);
  const busy = isBusy(state);
  const setup = state.status?.setup ?? null;
  const settingUp = setup ? setupLabel(setup, state.status?.provider) : null;
  const ready =
    state.connection === Connection.Open &&
    state.status !== null &&
    settingUp === null;
  const phase = meetingPhase(state);
  const live = phase === MeetingPhase.Live;
  const needsFolder = state.status?.project.needsFolder ?? false;
  const projectName =
    state.status && !needsFolder ? folderName(state.status.project.path) : null;
  const latestAsk = lastAsk(state);
  const chips = library
    ? [
        "Find my recent meetings",
        "What action items are still open?",
        "Help me organize my notes",
      ]
    : suggestions(
        phase,
        state.wrapUp?.state === WrapUpState.Ready &&
          hasFollowUp(state.wrapUp.wrapUp.follow_up_draft),
      );

  const ask = useCallback(
    async (text: string, images: readonly PreparedImage[] = []) => {
      setSent((count) => count + 1);
      const result =
        images.length > 0 ? await api.ask(text, images) : await api.ask(text);
      return result.ok;
    },
    [api],
  );

  const answer = useCallback(
    async (id: string, answers: string[]) => {
      setSent((count) => count + 1);
      const result = await api.answer(id, answers);
      return result.ok;
    },
    [api],
  );

  const retry = useCallback(
    (turn: Turn) => {
      if (turn.ask === TurnKind.Ask) void ask(turn.prompt);
      else void api.checkIn();
    },
    [api, ask],
  );

  const copyLast = useCallback(async () => {
    const last = [...state.items]
      .reverse()
      .find(
        (item): item is Turn =>
          item.kind === ItemKind.Turn && item.text.length > 0,
      );
    if (!last) {
      api.notify("There's no answer to copy yet.");
      return;
    }
    if (!(await copyText(last.text)))
      api.notify("Couldn't copy. Select the text and copy it instead.");
  }, [api, state.items]);

  const stopOrDismiss = useCallback(() => {
    if (state.question) void api.dismiss(state.question.id);
    else if (busy) void api.stop();
  }, [api, busy, state.question]);

  const newChat = useCallback(() => {
    composer.current?.cancelDictation();
    void api.newChat();
  }, [api]);

  const canCatchUp = live && !busy && ready;
  const lastItem = state.items.at(-1);
  const authErrorShowing =
    lastItem?.kind === ItemKind.Error &&
    lastItem.error.kind === CoachErrorKind.Auth;

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    if (canCatchUp)
      list.push({
        id: "check-in",
        label: "Catch me up",
        shortcut: CATCH_UP_SHORTCUT,
        run: () => void api.checkIn(),
      });
    list.push({
      id: "new-chat",
      label: "New chat",
      shortcut: ["mod", "shift", "o"],
      run: newChat,
    });
    if (busy)
      list.push({
        id: "stop",
        label: "Stop answering",
        shortcut: ["esc"],
        run: stopOrDismiss,
      });
    if (latestAsk && !busy)
      list.push({
        id: "retry",
        label: "Ask the last question again",
        run: () => retry(latestAsk),
      });
    list.push({
      id: "copy",
      label: "Copy the last answer",
      shortcut: ["mod", "shift", "c"],
      run: () => void copyLast(),
    });
    list.push({
      id: "reset-nudge-feedback",
      label: "Reset nudge feedback",
      run: () => {
        if (window.confirm("Reset the coach's learned nudge preferences?"))
          void api.resetFeedback();
      },
    });
    list.push({
      id: "focus",
      label: "Ask a question",
      shortcut: ["/"],
      run: () => composer.current?.focus(),
    });
    if (state.status?.appConnected && state.status.project.series) {
      list.push({
        id: "series-folder",
        label: "Choose a folder for this series",
        hint: state.status.project.series,
        run: () => void api.chooseSeriesFolder(),
      });
      if (state.status.project.source === ProjectSource.Series) {
        list.push({
          id: "default-folder",
          label: "Use the default folder",
          hint: folderName(state.status.project.defaultProject),
          run: () => void api.useDefaultFolder(),
        });
      }
    }
    return list;
  }, [
    api,
    busy,
    library,
    canCatchUp,
    copyLast,
    latestAsk,
    newChat,
    retry,
    state.status,
    stopOrDismiss,
  ]);

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (
      host.surface === AssistantSurface.Embedded &&
      !container.current?.contains(document.activeElement)
    )
      return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "k") {
      event.preventDefault();
      setPalette((open) => !open);
      return;
    }
    if (palette) return;
    if (mod && !event.shiftKey && key === "j") {
      event.preventDefault();
      if (canCatchUp) void api.checkIn();
    } else if (mod && event.shiftKey && key === "o") {
      event.preventDefault();
      newChat();
    } else if (mod && event.shiftKey && key === "c") {
      event.preventDefault();
      void copyLast();
    } else if (event.key === "Escape" || (mod && event.key === ".")) {
      if (state.question || busy) {
        event.preventDefault();
        stopOrDismiss();
      }
    } else if (event.key === "/" && !mod) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT");
      if (!typing) {
        event.preventDefault();
        composer.current?.focus();
      }
    }
  };
  const keyHandler = useRef(onKey);
  keyHandler.current = onKey;
  useMountEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  const placeholder = !ready
    ? state.connection === Connection.Lost
      ? "Reconnecting…"
      : settingUp && state.connection === Connection.Open
        ? settingUp
        : "Connecting to the coach…"
    : state.question
      ? "Type your own answer…"
      : live || phase === MeetingPhase.Ended
        ? "Ask about this meeting…"
        : projectName
          ? `Ask about ${projectName}…`
          : library
            ? "Ask about your meetings or anything else…"
            : "Ask the coach…";

  const submit = useCallback(
    async (text: string, images: readonly PreparedImage[]) => {
      if (state.question) return answer(state.question.id, [text]);
      return ask(text, images);
    },
    [answer, ask, state.question],
  );

  const timelineActions = useMemo<TimelineActions>(
    () => ({
      retry,
      newChat,
      quote: (text) =>
        composer.current?.fill(
          `About your earlier reply:\n${text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")}\n\n`,
        ),
      undo: (id) => void api.undo(id),
      copy: copyText,
      signIn: () => void api.signIn(),
      openEvidence: (target: EvidenceTarget) => void api.openEvidence(target),
      feedback: (input) => api.feedback(input),
      checkItem: (blockId, index, checked) =>
        void api.checkItem(blockId, index, checked),
      addItemToNote: api.addItemToNote,
      reply: (text) => void ask(text),
      open: (url) => void api.open(url),
    }),
    [api, ask, newChat, retry],
  );
  const lastTurn = state.items.at(-1);
  const repliesShowing =
    lastTurn?.kind === ItemKind.Turn &&
    lastTurn.blocks.some((block) => block.kind === BlockKind.Replies);
  const wrapUpActions = useMemo(
    () => ({
      copy: copyText,
      addActionItems: api.addActionItems,
      logToClients: api.logToClients,
      ask: (text: string) => void ask(text),
      openEvidence: (target: EvidenceTarget) => void api.openEvidence(target),
    }),
    [api, ask],
  );

  const wrapUp = state.wrapUp ? (
    <WrapUpCard view={state.wrapUp} busy={busy} actions={wrapUpActions} />
  ) : undefined;

  return (
    <div
      ref={container}
      className="cue-assistant bg-surface text-foreground flex h-full min-h-0 flex-col"
    >
      <Header
        titleOverride={library ? "Assistant" : undefined}
        provider={state.status?.provider}
        coaching={live ? state.status?.coaching : undefined}
        onCoachingChange={(input) => api.setCoaching(input)}
        connection={state.connection}
        transcript={state.transcript}
        usage={state.usage}
        proactive={state.status?.proactive ?? null}
        onNewChat={newChat}
        newChatDisabled={!ready}
        onPalette={() => setPalette(true)}
        idleSubtitle={header?.subtitle}
        actions={header?.actions}
      />
      {live && state.transcript && (
        <TranscriptStrip
          transcript={state.transcript}
          onCheckIn={() => void api.checkIn()}
          unavailable={
            !ready
              ? "Available once the coach reconnects"
              : busy
                ? "Available when this answer finishes"
                : null
          }
          emphasis={!authErrorShowing}
        />
      )}
      <Timeline
        key={`${state.status?.coaching?.sessionId ?? "conversation"}:${state.dictationOwner}`}
        live={live}
        items={state.items}
        sent={sent}
        glance={glance}
        footer={wrapUp}
        busy={busy}
        questionOpen={state.question !== null}
        ready={ready}
        canAddToNotes={
          (state.status?.appConnected ?? false) &&
          (state.status?.meeting ?? false)
        }
        latestUndoable={latestUndoable(state)}
        lastAskKey={latestAsk?.key ?? null}
        actions={timelineActions}
        empty={
          <EmptyState
            phase={phase}
            compact={glance}
            suggestions={glance ? chips.slice(0, 2) : chips}
            disabled={!ready || busy}
            onSuggestion={(text) => void ask(text)}
            onChooseFolder={
              !library && needsFolder
                ? () => void api.chooseProjectFolder()
                : undefined
            }
          />
        }
      />
      <Composer
        dictationOwner={state.dictationOwner}
        ref={composer}
        busy={busy && !state.question}
        ready={ready}
        placeholder={placeholder}
        status={state.status}
        chips={
          !glance &&
          !repliesShowing &&
          chipsAllowed(state) &&
          !isEmptyWrapUp(state.wrapUp) &&
          (state.items.length > 0 || state.wrapUp)
            ? chips
            : []
        }
        above={
          setup?.state === SetupState.Failed ? (
            <SetupFailed
              message={setup.message}
              onRetry={() => void api.retrySetup()}
            />
          ) : state.question ? (
            <QuestionPanel
              key={state.question.id}
              questions={state.question.questions}
              compact={glance}
              onAnswer={(answers) => {
                if (state.question) void answer(state.question.id, answers);
              }}
              onDismiss={stopOrDismiss}
            />
          ) : undefined
        }
        onSubmit={submit}
        onStop={() => void api.stop()}
        recall={() => latestAsk?.prompt ?? null}
        onChooseFolder={() => void api.chooseSeriesFolder()}
        onDefaultFolder={() => void api.useDefaultFolder()}
        onChooseProject={() => void api.chooseProjectFolder()}
      />
      {palette && (
        <Palette commands={commands} onClose={() => setPalette(false)} />
      )}
    </div>
  );
}
