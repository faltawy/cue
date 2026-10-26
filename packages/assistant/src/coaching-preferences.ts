import { z } from "zod";

export enum MeetingIntent {
  General = "general",
  Listening = "listening",
  Presenting = "presenting",
  Supporting = "supporting",
  Negotiating = "negotiating",
}

export const meetingIntentSchema = z.enum(MeetingIntent);

export const meetingCoachingSchema = z.object({
  intent: meetingIntentSchema.default(MeetingIntent.General),
  quiet: z.boolean().default(false),
});

export type MeetingCoaching = z.infer<typeof meetingCoachingSchema>;

export const DEFAULT_COACHING: MeetingCoaching = {
  intent: MeetingIntent.General,
  quiet: false,
};

export function intentGuidance(intent: MeetingIntent): string {
  switch (intent) {
    case MeetingIntent.Listening:
      return "Listening: help the user understand and make room for others; silence is often useful, and low participation or an extended listening stretch is not a problem to fix.";
    case MeetingIntent.Presenting:
      return "Presenting: support a clear explanation and genuine audience questions; sustained speaking is expected, so do not judge a monologue or talk share by itself.";
    case MeetingIntent.Supporting:
      return "Supporting: acknowledge stated impact and ask what help is wanted; avoid diagnosing feelings, rushing to solutions, or treating the conversation as a negotiation.";
    case MeetingIntent.Negotiating:
      return "Negotiating: clarify needs, constraints and mutual options; protect the user's stated boundaries without treating the other person as an opponent or requiring a concession in return.";
    case MeetingIntent.General:
      return "General: follow the conversation and the user's apparent purpose; do not assume a sales, leadership or persuasion goal.";
  }
}
