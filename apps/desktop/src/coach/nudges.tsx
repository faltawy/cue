import { t } from "@lingui/core/macro";
import { create } from "zustand";

import {
  type CoachNudged,
  commands as coachCommands,
  events as coachEvents,
} from "@anlg/plugin-coach";
import {
  commands as notificationCommands,
  events as notificationEvents,
} from "@anlg/plugin-notification";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { shouldShowNotification } from "~/shared/notification-policy";

const NUDGE_KEY_PREFIX = "coach-nudge:";
const NUDGE_NOTIFICATION_TIMEOUT_SECONDS = 20;

export const useCoachNudges = create<{ sessions: readonly string[] }>(() => ({
  sessions: [],
}));

function markNudged(sessionId: string) {
  useCoachNudges.setState(({ sessions }) =>
    sessions.includes(sessionId)
      ? { sessions }
      : { sessions: [...sessions, sessionId] },
  );
}

function clearNudges() {
  useCoachNudges.setState({ sessions: [] });
}

function tagLabel(tag: string): string {
  switch (tag) {
    case "open_question":
      return t`Open question`;
    case "pushback":
      return t`Pushback`;
    case "buying_signal":
      return t`Buying signal`;
    case "risk":
      return t`Risk`;
    case "vague_promise":
      return t`Vague promise`;
    case "over_promise":
      return t`Over-promise`;
    case "giving_ground":
      return t`Giving ground`;
    case "talk_time":
      return t`Talk time`;
    case "decision_owner":
      return t`Decision owner`;
    case "agenda":
      return t`Agenda`;
    default:
      return t`Coach`;
  }
}

async function showCoach() {
  const result = await coachCommands.show();
  if (result.status === "error") {
    console.error("[coach] failed to open from a nudge", result.error);
  }
}

// The app only hears about nudges while the coach window is hidden or in the background.
async function surfaceNudge(nudge: CoachNudged) {
  const notify = await shouldShowNotification("notification_coach_nudges");
  markNudged(nudge.session_id);
  if (!notify) return;
  try {
    const result = await notificationCommands.showNotification({
      key: `${NUDGE_KEY_PREFIX}${nudge.session_id}:${crypto.randomUUID()}`,
      title: tagLabel(nudge.tag),
      message: nudge.line,
      timeout: { secs: NUDGE_NOTIFICATION_TIMEOUT_SECONDS, nanos: 0 },
      source: null,
      start_time: null,
      participants: null,
      event_details: null,
      action_label: t`Open coach`,
      action: null,
      action_menu: null,
      action_variant: null,
      options: null,
      footer: null,
      icon: null,
    });
    if (result.status === "error") {
      console.error("[coach] failed to show a nudge", result.error);
    }
  } catch (error) {
    console.error("[coach] failed to show a nudge", error);
  }
}

export function CoachNudgeLifecycle() {
  useMountEffect(() => {
    const listening = [
      coachEvents.coachNudged.listen(({ payload }) => {
        void surfaceNudge(payload);
      }),
      coachEvents.coachFocused.listen(clearNudges),
      notificationEvents.notificationEvent.listen(({ payload }) => {
        if (
          (payload.type === "notification_confirm" ||
            payload.type === "notification_accept") &&
          payload.key.startsWith(NUDGE_KEY_PREFIX)
        ) {
          void showCoach();
        }
      }),
    ];
    return () => {
      for (const unlisten of listening) {
        void unlisten.then((stop) => stop());
      }
    };
  });
  return null;
}
