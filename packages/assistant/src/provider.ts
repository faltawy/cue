import { z } from "zod";

export enum CoachProvider {
  Claude = "claude",
  Codex = "codex",
}

export const providerSchema = z.enum(CoachProvider);

export function parseProvider(value: string | undefined): CoachProvider {
  return providerSchema.parse(value ?? CoachProvider.Claude);
}

export function providerName(provider: CoachProvider): string {
  return provider === CoachProvider.Codex ? "Codex" : "Claude";
}
