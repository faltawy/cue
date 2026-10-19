import path from "node:path";

import { detectHits, type HitKind } from "../src/detect";
import type { TranscriptLine } from "../src/transcript";
import { askTriage, parseTriage, TRIAGE_MODEL } from "../src/triage";

// Records live triage replies for the labelled moments in src/fixtures/triage-moments.json, so the eval test
// replays what the model really says. Calls the model once per detector-flagged moment (~28 small calls).
// Usage: bun scripts/record-triage.ts

const file = path.join(import.meta.dir, "../src/fixtures/triage-moments.json");
type Moment = { id: string; lines: Array<[string, string]>; nudge: boolean; reply: string } & Record<string, unknown>;
const data: { replies: string; moments: Moment[] } = await Bun.file(file).json();

let agreed = 0;
let asked = 0;
for (const moment of data.moments) {
  const lines: TranscriptLine[] = moment.lines.map(([speaker, text], index) => ({
    speaker,
    channel: speaker === "You" ? 0 : 1,
    start_ms: 60_000 + index * 6_000,
    end_ms: 64_000 + index * 6_000,
    text,
  }));
  const kinds = [...new Set<HitKind>(lines.flatMap((line, index) => detectHits(line, index, "Ahmad Falta").map((hit) => hit.kind)))];
  if (kinds.length === 0) continue;
  asked += 1;
  const answer = await askTriage(
    { context: "Rollout sync · with Omar, Sara", kinds, lines },
    { signal: AbortSignal.timeout(60_000) },
  );
  if ("error" in answer) throw new Error(`${moment.id}: ${answer.error}`);
  moment.reply = answer.reply;
  const verdict = parseTriage(answer.reply);
  const ok = (verdict?.nudge ?? false) === moment.nudge;
  if (ok) agreed += 1;
  console.log(`${ok ? "ok  " : "MISS"} ${moment.id}: ${answer.reply.replace(/\s+/g, " ")}`);
}

data.replies = `recorded from ${TRIAGE_MODEL} on ${new Date().toISOString().slice(0, 10)} by scripts/record-triage.ts`;
await Bun.write(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`\n${agreed}/${asked} flagged moments match their label`);
