import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { Hit, HitKind } from "./detect";
import { type MeetingSeen, meetingSeenSchema } from "./meeting-context";
import type { CoachFeedback, MoveTag } from "./move";
import type { CoachEvent, ResetReason, WrapUpView } from "./protocol";
import { type CoachProvider, providerSchema } from "./provider";

export const MAX_MEETINGS = 20;
export const MAX_HISTORY = 400;

export type SettledWrapUp = Extract<WrapUpView, { state: "ready" | "failed" }>;

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
    provider: providerSchema.default("claude"),
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
      (value.state === "ready" || value.state === "failed"),
  ),
});

const storeSchema = z.object({
  meetings: z.record(z.string(), chatSchema),
  wrapUps: z.record(z.string(), wrapUpSchema).default({}),
  feedback: z
    .object({
      categories: z
        .record(z.string(), z.number().int().min(-3).max(3))
        .default({}),
      handledMoments: z.array(z.string()).max(500).default([]),
    })
    .default({ categories: {}, handledMoments: [] }),
});

export type StoredChat = z.infer<typeof chatSchema>;
export type StoredWrapUp = z.infer<typeof wrapUpSchema>;
export type ChatStore = z.infer<typeof storeSchema>;

export const emptyStore = (): ChatStore => ({
  meetings: {},
  wrapUps: {},
  feedback: { categories: {}, handledMoments: [] },
});

export function recordFeedback(
  store: ChatStore,
  input: CoachFeedback,
): ChatStore {
  const current = store.feedback.categories[input.category] ?? 0;
  const categories = {
    ...store.feedback.categories,
    [input.category]: Math.max(
      -3,
      Math.min(3, current + (input.useful ? 1 : -1)),
    ),
  };
  const handledMoments =
    input.reason === "already_handled" && input.momentId
      ? [...new Set([...store.feedback.handledMoments, input.momentId])].slice(
          -500,
        )
      : store.feedback.handledMoments;
  return { ...store, feedback: { categories, handledMoments } };
}

export function feedbackPreferences(store: ChatStore) {
  return store.feedback;
}

export function isHandledMoment(store: ChatStore, momentId: string): boolean {
  return store.feedback.handledMoments.includes(momentId);
}

const hitCategories: Record<HitKind, readonly MoveTag[]> = {
  question: ["open_question", "buying_signal"],
  name: ["risk"],
  objection: ["pushback", "giving_ground", "risk"],
  commitment: ["vague_promise", "over_promise", "decision_owner"],
  number: ["risk", "buying_signal"],
  monologue: ["talk_time"],
};

export function prioritizeHitsByFeedback(
  store: ChatStore,
  hits: readonly Hit[],
): Hit[] {
  return hits
    .map((hit, index) => ({
      hit,
      index,
      priority: hitCategories[hit.kind].reduce(
        (total, category) => total + (store.feedback.categories[category] ?? 0),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .map(({ hit }) => hit);
}

export function clearFeedback(store: ChatStore): ChatStore {
  return { ...store, feedback: { categories: {}, handledMoments: [] } };
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
      provider: "claude" as const,
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

export type OpenReason = ResetReason | "startup" | "recover";

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
    provider: "claude" as const,
    model: "sonnet",
  };
  const modelFor = (owner: CoachProvider, saved?: string) =>
    selected.models?.[owner] ??
    (owner === selected.provider
      ? selected.model
      : (saved ?? (owner === "claude" ? "sonnet" : "")));
  if (reason === "recover") {
    const same = current.project === project;
    const resume = same ? current.runtimeSessionId : null;
    return {
      provider: same ? (current.provider ?? "claude") : selected.provider,
      model: same
        ? modelFor(current.provider ?? "claude", current.model)
        : selected.model,
      store: input.store,
      resume,
      history: same ? current.history : [],
      seen: resume ? current.seen : undefined,
    };
  }
  const store =
    reason === "manual" && meeting
      ? forget(input.store, meeting.sessionId)
      : input.store;
  const stored = reason === "manual" ? null : chatFor(store, meeting, project);
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
