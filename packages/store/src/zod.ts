import { z } from "zod";

import { AIProviderType } from "@anlg/provider-validation";

export { AIProviderType } from "@anlg/provider-validation";

import { jsonObject, type ToStorageType } from "./shared";

export const sessionEventSchema = z.object({
  tracking_id: z.string(),
  calendar_id: z.string(),
  title: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  is_all_day: z.boolean(),
  has_recurrence_rules: z.boolean(),
  location: z.string().optional(),
  meeting_link: z.string().optional(),
  description: z.string().optional(),
  recurrence_series_id: z.string().optional(),
});

export const eventParticipantSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  is_organizer: z.boolean().optional(),
  is_current_user: z.boolean().optional(),
});

export const templateSectionSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export enum ChatMessageStatus {
  Streaming = "streaming",
  Ready = "ready",
  Error = "error",
  Aborted = "aborted",
}

export enum TaskStatus {
  Todo = "todo",
  InProgress = "in_progress",
  Done = "done",
}

export const chatMessageStatusSchema = z.enum(ChatMessageStatus);
export const taskStatusSchema = z.enum(TaskStatus);

export const wordSchema = z.object({
  text: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  channel: z.number(),
  speaker: z.preprocess((val) => val ?? undefined, z.string().optional()),
  metadata: z.preprocess(
    (val) => val ?? undefined,
    jsonObject(z.record(z.string(), z.unknown())).optional(),
  ),
});

export const speakerHintSchema = z.object({
  word_id: z.string(),
  type: z.string(),
  value: jsonObject(z.record(z.string(), z.unknown())),
});

export const aiProviderSchema = z
  .object({
    type: z.enum(AIProviderType),
    base_url: z.url().min(1),
    api_key: z.string(),
  })
  .refine(
    (data) => !data.base_url.startsWith("https:") || data.api_key.length > 0,
    {
      message: "API key is required for HTTPS URLs",
      path: ["api_key"],
    },
  );

export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type EventParticipant = z.infer<typeof eventParticipantSchema>;
export type TemplateSection = z.infer<typeof templateSectionSchema>;
export type AIProvider = z.infer<typeof aiProviderSchema>;
export type WordStorage = ToStorageType<typeof wordSchema>;
export type SpeakerHintStorage = ToStorageType<typeof speakerHintSchema>;
export type AIProviderStorage = ToStorageType<typeof aiProviderSchema>;
