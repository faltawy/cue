import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { CoachEvent, ResetReason } from "./protocol";

export const MAX_MEETINGS = 20;
export const MAX_HISTORY = 400;

const chatSchema = z.object({
  claudeSessionId: z.string().min(1),
  project: z.string().min(1),
  updatedAt: z.number(),
  history: z.array(z.custom<CoachEvent>((value) => typeof value === "object" && value !== null && "type" in value)),
});

const storeSchema = z.object({ meetings: z.record(z.string(), chatSchema) });

export type StoredChat = z.infer<typeof chatSchema>;
export type ChatStore = z.infer<typeof storeSchema>;

export const emptyStore = (): ChatStore => ({ meetings: {} });

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
    console.error("[coach] ignoring an unreadable chat store", { _e: String(error), file });
    return emptyStore();
  }
}

export function saveChats(file: string, store: ChatStore) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(store), { mode: 0o600 });
  renameSync(temp, file);
}

export function resumeFor(
  store: ChatStore,
  meeting: { sessionId: string; live: boolean } | null,
  project: string,
): StoredChat | null {
  if (!meeting?.live) return null;
  const chat = store.meetings[meeting.sessionId];
  return chat && chat.project === project ? chat : null;
}

export function remember(
  store: ChatStore,
  meetingId: string,
  chat: Omit<StoredChat, "history" | "updatedAt"> & { history: readonly CoachEvent[]; updatedAt: number },
): ChatStore {
  const meetings = { ...store.meetings, [meetingId]: { ...chat, history: chat.history.slice(-MAX_HISTORY) } };
  const kept = Object.entries(meetings)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_MEETINGS);
  return { meetings: Object.fromEntries(kept) };
}

export function forget(store: ChatStore, meetingId: string): ChatStore {
  if (!(meetingId in store.meetings)) return store;
  const { [meetingId]: _dropped, ...meetings } = store.meetings;
  return { meetings };
}

export type OpenReason = ResetReason | "startup" | "recover";

export type ChatPlan = {
  store: ChatStore;
  resume: string | null;
  history: CoachEvent[];
};

export function planChat(input: {
  reason: OpenReason;
  store: ChatStore;
  meeting: { sessionId: string; live: boolean } | null;
  project: string;
  current: { claudeSessionId: string | null; project: string; history: CoachEvent[] };
}): ChatPlan {
  const { reason, meeting, project, current } = input;
  if (reason === "recover") {
    const same = current.claudeSessionId !== null && current.project === project;
    return {
      store: input.store,
      resume: same ? current.claudeSessionId : null,
      history: same ? current.history : [],
    };
  }
  const store = reason === "manual" && meeting ? forget(input.store, meeting.sessionId) : input.store;
  const stored = reason === "manual" ? null : resumeFor(store, meeting, project);
  return { store, resume: stored?.claudeSessionId ?? null, history: stored ? [...stored.history] : [] };
}
