import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  DEFAULT_COACHING,
  type MeetingCoaching,
  meetingCoachingSchema,
} from "./coaching-preferences";
import { type Hit, type HitKind } from "./detect";
import { type MeetingSeen, meetingSeenSchema } from "./meeting-context";
import { CoachFeedback, FeedbackReason, MoveTag } from "./move";
import { CoachEvent, ResetReason, WrapUpState, WrapUpView } from "./protocol";
import { CoachProvider, providerSchema } from "./provider";

export const MAX_MEETINGS = 20;
export const MAX_HISTORY = 400;

export type SettledWrapUp = Extract<
  WrapUpView,
  { state: WrapUpState.Ready | WrapUpState.Failed }
>;

const chatSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    const record = Object.fromEntries(Object.entries(value));
    return {
      ...record,
      runtimeSessionId:
        record.runtimeSessionId ?? record.claudeSessionId ?? null,
    };
  },
  z.object({
    provider: providerSchema.default(CoachProvider.Claude),
    model: z.string().optional(),
    runtimeSessionId: z.string().min(1).nullable(),
    project: z.string().min(1),
    updatedAt: z.number(),
    history: z.array(
      z.custom<CoachEvent>(
        (value) =>
          typeof value === "object" && value !== null && "type" in value,
      ),
    ),
    seen: meetingSeenSchema.optional(),
  }),
);

const wrapUpSchema = z.object({
  transcriptId: z.string().min(1),
  updatedAt: z.number(),
  view: z.custom<SettledWrapUp>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "state" in value &&
      (value.state === WrapUpState.Ready || value.state === WrapUpState.Failed),
  ),
});

const storeSchema = z.object({
  meetings: z.record(z.string(), chatSchema),
  wrapUps: z.record(z.string(), wrapUpSchema).default({}),
  coaching: z
    .record(
      z.string(),
      meetingCoachingSchema.extend({
        deferred: z.array(z.string().max(500)).max(20).default([]),
        updatedAt: z.number(),
      }),
    )
    .default({}),
  feedback: z
    .object({
      categories: z
        .record(z.string(), z.number().int().min(-3).max(3))
        .default({}),
      handledMoments: z.array(z.string()).max(500).default([]),
      carefulTiming: z.boolean().default(false),
    })
    .default({ categories: {}, handledMoments: [], carefulTiming: false }),
});

export type StoredChat = z.infer<typeof chatSchema>;
export type StoredWrapUp = z.infer<typeof wrapUpSchema>;
export type ChatStore = z.infer<typeof storeSchema>;

export const emptyStore = (): ChatStore => ({
  meetings: {},
  wrapUps: {},
  coaching: {},
  feedback: { categories: {}, handledMoments: [], carefulTiming: false },
});

export function coachingFor(store: ChatStore, sessionId: string) {
  return (
    store.coaching[sessionId] ?? {
      ...DEFAULT_COACHING,
      deferred: [],
      updatedAt: 0,
    }
  );
}

export function setMeetingCoaching(
  store: ChatStore,
  sessionId: string,
  patch: Partial<MeetingCoaching>,
): ChatStore {
  return {
    ...store,
    coaching: newest({
      ...store.coaching,
      [sessionId]: {
        ...coachingFor(store, sessionId),
        ...patch,
        updatedAt: Date.now(),
      },
    }),
  };
}

export function deferCoaching(
  store: ChatStore,
  sessionId: string,
  note: string,
): ChatStore {
  const current = coachingFor(store, sessionId);
  return {
    ...store,
    coaching: newest({
      ...store.coaching,
      [sessionId]: {
        ...current,
        deferred: [...new Set([...current.deferred, note])].slice(-20),
        updatedAt: Date.now(),
      },
    }),
  };
}

export function recordFeedback(
  store: ChatStore,
  input: CoachFeedback,
): ChatStore {
  const current = store.feedback.categories[input.category] ?? 0;
  const categories =
    input.reason === FeedbackReason.PoorTiming
      ? store.feedback.categories
      : {
          ...store.feedback.categories,
          [input.category]: Math.max(
            -3,
            Math.min(3, current + (input.useful ? 1 : -1)),
          ),
        };
  const handledMoments =
    input.reason === FeedbackReason.AlreadyHandled && input.momentId
      ? [...new Set([...store.feedback.handledMoments, input.momentId])].slice(
          -500,
        )
      : store.feedback.handledMoments;
  return {
    ...store,
    feedback: {
      categories,
      handledMoments,
      carefulTiming:
        store.feedback.carefulTiming ||
        input.reason === FeedbackReason.PoorTiming,
    },
  };
}

export function saveFeedback(
  file: string,
  store: ChatStore,
  input: CoachFeedback | null,
): ChatStore {
  const next =
    input === null ? clearFeedback(store) : recordFeedback(store, input);
  saveChats(file, next);
  return next;
}

export function feedbackPreferences(store: ChatStore) {
  return store.feedback;
}

export function isHandledMoment(store: ChatStore, momentId: string): boolean {
  return store.feedback.handledMoments.includes(momentId);
}

const hitCategories: Record<HitKind, readonly MoveTag[]> = {
  question: [MoveTag.OpenQuestion, MoveTag.BuyingSignal],
  name: [MoveTag.Risk],
  objection: [MoveTag.Pushback, MoveTag.GivingGround, MoveTag.Risk],
  commitment: [
    MoveTag.VaguePromise,
    MoveTag.OverPromise,
    MoveTag.DecisionOwner,
  ],
  number: [MoveTag.Risk, MoveTag.BuyingSignal],
  monologue: [MoveTag.TalkTime],
};

export function prioritizeHitsByFeedback(
  store: ChatStore,
  hits: readonly Hit[],
): Hit[] {
  const moments = new Map<number, { hits: Hit[]; priority: number }>();
  for (const hit of hits) {
    const priority = hitCategories[hit.kind].reduce(
      (total, category) => total + (store.feedback.categories[category] ?? 0),
      0,
    );
    const moment = moments.get(hit.lineIndex);
    if (moment) {
      moment.hits.push(hit);
      moment.priority = Math.max(moment.priority, priority);
    } else {
      moments.set(hit.lineIndex, { hits: [hit], priority });
    }
  }
  // The prompt keeps the tail, so preferred moments must come last.
  return [...moments.values()]
    .sort((left, right) => left.priority - right.priority)
    .flatMap((moment) => moment.hits);
}

export function clearFeedback(store: ChatStore): ChatStore {
  return {
    ...store,
    feedback: { categories: {}, handledMoments: [], carefulTiming: false },
  };
}

export function loadChats(file: string): ChatStore {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return emptyStore();
  }
  try {
    return storeSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.error("[coach] ignoring an unreadable chat store", {
      _e: String(error),
      file,
    });
    return emptyStore();
  }
}

export function saveChats(file: string, store: ChatStore) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(store), { mode: 0o600 });
  renameSync(temp, file);
}

function chatFor(
  store: ChatStore,
  meeting: { sessionId: string } | null,
  project: string,
): StoredChat | null {
  const chat = meeting ? store.meetings[meeting.sessionId] : undefined;
  return chat && chat.project === project ? chat : null;
}

export function resumeFor(
  store: ChatStore,
  meeting: { sessionId: string; live: boolean } | null,
  project: string,
): StoredChat | null {
  if (!meeting?.live) return null;
  const chat = chatFor(store, meeting, project);
  return chat?.runtimeSessionId ? chat : null;
}

function newest<T extends { updatedAt: number }>(
  entries: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_MEETINGS),
  );
}

export function remember(
  store: ChatStore,
  meetingId: string,
  chat: Omit<StoredChat, "history" | "updatedAt" | "provider" | "model"> & {
    provider?: CoachProvider;
    model?: string;
    history: readonly CoachEvent[];
    updatedAt: number;
  },
): ChatStore {
  if (!chat.runtimeSessionId && chat.history.length === 0) return store;
  const meetings = {
    ...store.meetings,
    [meetingId]: {
      provider: CoachProvider.Claude,
      model: "sonnet",
      ...chat,
      history: chat.history.slice(-MAX_HISTORY),
    },
  };
  return { ...store, meetings: newest(meetings) };
}

export function forget(store: ChatStore, meetingId: string): ChatStore {
  if (!(meetingId in store.meetings)) return store;
  const { [meetingId]: _dropped, ...meetings } = store.meetings;
  return { ...store, meetings };
}

export function dropResume(store: ChatStore, meetingId: string): ChatStore {
  const chat = store.meetings[meetingId];
  if (!chat?.runtimeSessionId) return store;
  const { seen: _seen, ...kept } = chat;
  return {
    ...store,
    meetings: {
      ...store.meetings,
      [meetingId]: { ...kept, runtimeSessionId: null },
    },
  };
}

export function keepWrapUp(
  store: ChatStore,
  meetingId: string,
  wrapUp: StoredWrapUp,
): ChatStore {
  return {
    ...store,
    wrapUps: newest({ ...store.wrapUps, [meetingId]: wrapUp }),
  };
}

export function wrappedTranscripts(store: ChatStore): Set<string> {
  return new Set(
    Object.values(store.wrapUps).map((wrapUp) => wrapUp.transcriptId),
  );
}

export enum ResumeReason {
  Startup = "startup",
  Recover = "recover",
}
export type OpenReason = ResetReason | ResumeReason;

export type ChatPlan = {
  provider: CoachProvider;
  model: string;
  store: ChatStore;
  resume: string | null;
  history: CoachEvent[];
  seen?: MeetingSeen;
  wrapUp?: StoredWrapUp;
};

export function planChat(input: {
  reason: OpenReason;
  store: ChatStore;
  meeting: { sessionId: string; live: boolean } | null;
  project: string;
  selected?: {
    provider: CoachProvider;
    model: string;
    models?: Record<CoachProvider, string>;
  };
  current: {
    provider?: CoachProvider;
    model?: string;
    runtimeSessionId: string | null;
    project: string;
    history: CoachEvent[];
    seen?: MeetingSeen;
  };
}): ChatPlan {
  const { reason, meeting, project, current } = input;
  const selected = input.selected ?? {
    provider: CoachProvider.Claude,
    model: "sonnet",
  };
  const modelFor = (owner: CoachProvider, saved?: string) =>
    selected.models?.[owner] ??
    (owner === selected.provider
      ? selected.model
      : (saved ?? (owner === CoachProvider.Claude ? "sonnet" : "")));
  if (reason === ResumeReason.Recover) {
    const same = current.project === project;
    const resume = same ? current.runtimeSessionId : null;
    return {
      provider: same
        ? (current.provider ?? CoachProvider.Claude)
        : selected.provider,
      model: same
        ? modelFor(current.provider ?? CoachProvider.Claude, current.model)
        : selected.model,
      store: input.store,
      resume,
      history: same ? current.history : [],
      seen: resume ? current.seen : undefined,
    };
  }
  const store =
    reason === ResetReason.Manual && meeting
      ? forget(input.store, meeting.sessionId)
      : input.store;
  const stored =
    reason === ResetReason.Manual ? null : chatFor(store, meeting, project);
  const resume = resumeFor(store, meeting, project)?.runtimeSessionId ?? null;
  const wrapUp = meeting ? store.wrapUps[meeting.sessionId] : undefined;
  return {
    provider: stored?.provider ?? selected.provider,
    model: modelFor(stored?.provider ?? selected.provider, stored?.model),
    store,
    resume: stored ? resume : null,
    history: stored ? [...stored.history] : [],
    ...(resume && stored ? { seen: stored.seen } : {}),
    ...(wrapUp ? { wrapUp } : {}),
  };
}
