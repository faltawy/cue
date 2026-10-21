import { z } from "zod";

export const providerSchema = z.enum(["claude", "codex"]);
export type CoachProvider = z.infer<typeof providerSchema>;

export function parseProvider(value: string | undefined): CoachProvider {
  return providerSchema.parse(value ?? "claude");
}

export function providerName(provider: CoachProvider): string {
  return provider === "codex" ? "Codex" : "Claude";
}
