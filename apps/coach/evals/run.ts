import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import { isNothing } from "../src/checkin";
import { claudeCodeFromArgs } from "../src/claude-code";
import { LlmEventType, type LlmTuning, runLlm } from "../src/llm";
import {
  NUDGE_MODEL,
  NudgeDelivery,
  nudgeMessage,
  NudgeParseKind,
  nudgeSystem,
  parseNudge,
} from "../src/nudge";
import { PROACTIVE_DEFAULTS } from "../src/proactive";
import { coachPrompt, userContextPrompt } from "../src/session";
import { renderLines } from "../src/transcript";
import {
  parseTriage,
  TRIAGE_MODEL,
  TRIAGE_SYSTEM,
  triagePrompt,
} from "../src/triage";
import {
  OLD_TRIAGE_SYSTEM,
  oldCoachAppend,
  oldNudgeMessage,
  oldNudgeSystem,
} from "./baseline";
import {
  EvalKind,
  EvalTrigger,
  expectedDelivery,
  type Moment,
  momentHits,
  momentLines,
  MOMENTS,
  momentWhy,
} from "./moments";
import { JUDGE_SYSTEM } from "./rubric";

// Offline coaching eval: runs each scripted moment through the nudge path (or, for direct asks, a one-shot
// stand-in for the main coach with the transcript inlined), scores the note with a fixed judge, and checks
// triage on the same moments. "old" is the frozen pre-rewrite prompts in baseline.ts, "new" is src/ as it is.
// Calls are cached by prompt hash under results/raw, so a rerun only pays for prompts that changed.
// Usage: bun evals/run.ts --variant old|new [--judge] [--triage] [--only id,id] [--kind nudge|ask] ; bun evals/run.ts --summary

const { values } = parseArgs({
  options: {
    variant: { type: "string" },
    judge: { type: "boolean", default: false },
    triage: { type: "boolean", default: false },
    only: { type: "string" },
    kind: { type: "string" },
    summary: { type: "boolean", default: false },
  },
});

const RESULTS = path.join(import.meta.dir, "results");
const RAW = path.join(RESULTS, "raw");
const JUDGE_MODEL = "sonnet";
const ASK_MODEL = "sonnet";
const CONCURRENCY = 4;
enum Variant {
  Old = "old",
  New = "new",
}
const VARIANTS = Object.values(Variant);

const scoreSchema = z.object({
  specificity: z.number().int().min(1).max(5),
  actionability: z.number().int().min(1).max(5),
  correctness: z.number().int().min(1).max(5),
  brevity: z.number().int().min(1).max(5),
  coaching: z.number().int().min(1).max(5),
  notes: z.string(),
});
type Score = z.infer<typeof scoreSchema>;
const DIMENSIONS = [
  "coaching",
  "actionability",
  "specificity",
  "correctness",
  "brevity",
] as const;

type Prompt = {
  model: string;
  system: string;
  message: string;
  tuning: LlmTuning;
  schema?: Record<string, unknown>;
};
type Cached = { hash: string; text: string };

let calls = 0;

const { executable: claudePath } = claudeCodeFromArgs({});

function hashOf(prompt: Prompt): string {
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(prompt))
    .digest("hex")
    .slice(0, 16);
}

async function complete(prompt: Prompt, file: string): Promise<string> {
  const hash = hashOf(prompt);
  const cached = Bun.file(file);
  if (await cached.exists()) {
    const previous: Cached = await cached.json();
    if (previous.hash === hash) return previous.text;
  }
  calls += 1;
  let text = "";
  for await (const event of runLlm(
    {
      model: prompt.model,
      system: prompt.system,
      messages: [
        { role: "user", content: [{ type: "text", text: prompt.message }] },
      ],
      ...(prompt.schema ? { schema: prompt.schema } : {}),
    },
    AbortSignal.timeout(120_000),
    await claudePath(),
    prompt.tuning,
  )) {
    if (event.type === LlmEventType.Text) text += event.delta;
    else if (event.type === LlmEventType.Error)
      throw new Error(`${path.basename(file)}: ${event.message}`);
  }
  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(
    file,
    `${JSON.stringify({ hash, text: text.trim() } satisfies Cached, null, 2)}\n`,
  );
  return text.trim();
}

function coachPromptFor(variant: Variant, moment: Moment): Prompt {
  const lines = momentLines(moment);
  if (moment.kind === EvalKind.Ask) {
    const system =
      variant === Variant.Old
        ? oldCoachAppend(moment.instructions)
        : coachPrompt() + userContextPrompt([], moment.instructions);
    return {
      model: ASK_MODEL,
      system,
      message: `(mcp__meeting__live_transcript returned:)\nMeeting: ${moment.context} (recording)\n${renderLines(lines)}\n\n${moment.ask ?? ""}`,
      tuning: {},
    };
  }
  const input = {
    context: moment.context,
    intent: moment.intent,
    hits: momentHits(moment, lines),
    why: momentWhy(moment, lines),
    lines,
  };
  return variant === Variant.Old
    ? {
        model: NUDGE_MODEL,
        system: oldNudgeSystem(moment.instructions),
        message: oldNudgeMessage(input),
        tuning: { effort: "low", shortCache: true },
      }
    : {
        model: NUDGE_MODEL,
        system: nudgeSystem(moment.instructions),
        message: nudgeMessage(input),
        tuning: { effort: "low", shortCache: true },
      };
}

function judgePrompt(
  moment: Moment,
  note: string,
  delivery: NudgeDelivery,
): Prompt {
  const trigger =
    moment.kind === EvalKind.Ask
      ? `The user asked the coach: "${moment.ask}"`
      : "The coach spoke up on its own at this moment; the user did not ask.";
  return {
    model: JUDGE_MODEL,
    system: JUDGE_SYSTEM,
    message: `Meeting type: ${moment.type}
Meeting: ${moment.context}
Intent: ${moment.intent}; expected delivery: ${expectedDelivery(moment)}; actual delivery: ${delivery}
The user's own instructions to the coach: ${moment.instructions || "(none)"}
Transcript, latest last ("You" is the user):
${renderLines(momentLines(moment))}

${trigger}
Reference, what good coaching looks like here: ${moment.good}

The coach's note:
"""
${note}
"""`,
    tuning: {},
    schema: z.toJSONSchema(scoreSchema, { target: "draft-7" }),
  };
}

function triagePromptFor(variant: Variant, moment: Moment): Prompt {
  const lines = momentLines(moment);
  const latestEnd = lines.at(-1)?.end_ms ?? 0;
  const kinds = [...new Set(momentHits(moment, lines).map((hit) => hit.kind))];
  return {
    model: TRIAGE_MODEL,
    system: variant === Variant.Old ? OLD_TRIAGE_SYSTEM : TRIAGE_SYSTEM,
    message: triagePrompt({
      context: moment.context,
      intent: moment.intent,
      kinds,
      lines: lines.filter(
        (line) => line.end_ms >= latestEnd - PROACTIVE_DEFAULTS.windowMs,
      ),
    }),
    tuning: { thinking: { type: "disabled" }, shortCache: true },
  };
}

async function pool<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift())
        await run(item);
    }),
  );
}

const file = (variant: Variant, moment: Moment, suffix: string) =>
  path.join(RAW, variant, `${moment.id}.${suffix}.json`);

async function readCached(target: string): Promise<string | null> {
  const cached = Bun.file(target);
  return (await cached.exists())
    ? ((await cached.json()) as Cached).text
    : null;
}

type Shown = {
  text: string;
  silent: boolean;
  malformed: boolean;
  delivery: NudgeDelivery;
};

// Score the collapsed card's single line; malformed replies never reach the user.
function shownNote(variant: Variant, moment: Moment, raw: string): Shown {
  if (variant === Variant.New && moment.kind === EvalKind.Nudge) {
    const parsed = parseNudge(raw);
    if (parsed.kind === NudgeParseKind.Move)
      return {
        text: parsed.reply.line,
        silent: false,
        malformed: false,
        delivery: NudgeDelivery.Now,
      };
    if (parsed.kind === NudgeParseKind.Later)
      return {
        text: parsed.note,
        silent: true,
        malformed: false,
        delivery: NudgeDelivery.Later,
      };
    return {
      text: "",
      silent: true,
      malformed: parsed.kind === NudgeParseKind.Malformed,
      delivery: NudgeDelivery.Silent,
    };
  }
  const silent = isNothing(raw) || raw === "";
  return {
    text: raw,
    silent,
    malformed: false,
    delivery: silent ? NudgeDelivery.Silent : NudgeDelivery.Now,
  };
}

async function runVariant(variant: Variant, moments: readonly Moment[]) {
  await pool(moments, async (moment) => {
    const raw = await complete(
      coachPromptFor(variant, moment),
      file(variant, moment, "note"),
    );
    const { text: note, delivery, malformed } = shownNote(variant, moment, raw);
    console.log(
      `${variant} ${moment.id}: ${malformed ? "(malformed, dropped)" : `(${delivery}) ${note.replace(/\s+/g, " ").slice(0, 160)}`}`,
    );
    if (values.judge && delivery !== NudgeDelivery.Silent) {
      const score = scoreSchema.parse(
        JSON.parse(
          await complete(
            judgePrompt(moment, note, delivery),
            file(variant, moment, "judge"),
          ),
        ),
      );
      console.log(
        `   judge: ${DIMENSIONS.map((dimension) => `${dimension} ${score[dimension]}`).join(", ")} · ${score.notes}`,
      );
    }
    if (
      values.triage &&
      moment.kind === EvalKind.Nudge &&
      moment.trigger === EvalTrigger.Lines
    ) {
      const reply = await complete(
        triagePromptFor(variant, moment),
        file(variant, moment, "triage"),
      );
      const verdict = parseTriage(reply);
      console.log(
        `   triage: ${verdict?.nudge === (expectedDelivery(moment) !== NudgeDelivery.Silent) ? "ok" : "MISS"} ${reply.replace(/\s+/g, " ")}`,
      );
    }
  });
}

type Row = {
  moment: Moment;
  note: Shown | null;
  score: Score | null;
  triage: boolean | null;
};

async function rows(variant: Variant): Promise<Row[]> {
  return Promise.all(
    MOMENTS.map(async (moment) => {
      const raw = await readCached(file(variant, moment, "note"));
      const note = raw === null ? null : shownNote(variant, moment, raw);
      const judged =
        note && note.delivery !== NudgeDelivery.Silent
          ? await readCached(file(variant, moment, "judge"))
          : null;
      const triaged = await readCached(file(variant, moment, "triage"));
      return {
        moment,
        note,
        score: judged ? scoreSchema.parse(JSON.parse(judged)) : null,
        triage:
          triaged === null ? null : (parseTriage(triaged)?.nudge ?? false),
      };
    }),
  );
}

const mean = (values: readonly number[]) =>
  values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
    : "–";

function aggregate(all: readonly Row[]) {
  const nudges = all.filter(
    (row) => row.moment.kind === EvalKind.Nudge && row.note !== null,
  );
  const silentRight = nudges.filter(
    (row) =>
      !row.note?.malformed &&
      row.note?.delivery === expectedDelivery(row.moment),
  ).length;
  const spoke = all.filter((row) => !row.moment.silent && row.note !== null);
  const missed = spoke.filter((row) => row.note?.silent).length;
  const judged = all.filter((row) => row.score !== null);
  const triaged = all.filter((row) => row.triage !== null);
  return {
    silence: `${silentRight}/${nudges.length}`,
    missed,
    malformed: all.filter((row) => row.note?.malformed).length,
    triage: triaged.length
      ? `${triaged.filter((row) => row.triage === (expectedDelivery(row.moment) !== NudgeDelivery.Silent)).length}/${triaged.length}`
      : "–",
    dims: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        mean(judged.map((row) => row.score?.[dimension] ?? 0)),
      ]),
    ),
    words: mean(
      spoke
        .filter((row) => !row.note?.silent)
        .map((row) => (row.note?.text ?? "").split(/\s+/).length),
    ),
    judged: judged.length,
  };
}

async function writeSummary() {
  const byVariant = Object.fromEntries(
    await Promise.all(
      VARIANTS.map(async (variant) => [variant, await rows(variant)] as const),
    ),
  );
  const totalsOf = (kind: Moment["kind"]) =>
    Object.fromEntries(
      VARIANTS.map((variant) => [
        variant,
        aggregate(
          (byVariant[variant] ?? []).filter((row) => row.moment.kind === kind),
        ),
      ]),
    );
  const nudges = totalsOf(EvalKind.Nudge);
  const asks = totalsOf(EvalKind.Ask);
  const header = `| | ${VARIANTS.map((variant) => `${variant} nudges`).join(" | ")} | ${VARIANTS.map((variant) => `${variant} asks`).join(" | ")} |\n|---|${[...VARIANTS, ...VARIANTS].map(() => "---").join("|")}|`;
  const line = (
    label: string,
    pick: (totals: ReturnType<typeof aggregate> | undefined) => string | number,
  ) =>
    `| ${label} | ${[...VARIANTS.map((variant) => pick(nudges[variant])), ...VARIANTS.map((variant) => pick(asks[variant]))].join(" | ")} |`;
  const table = [
    header,
    ...DIMENSIONS.map((dimension) =>
      line(`${dimension} (1-5)`, (totals) => totals?.dims[dimension] ?? "–"),
    ),
    line(
      "correct now / later / silent delivery",
      (totals) => totals?.silence ?? "–",
    ),
    line(
      "stayed silent when it should have spoken",
      (totals) => totals?.missed ?? "–",
    ),
    line("malformed replies (dropped)", (totals) => totals?.malformed ?? "–"),
    line("triage agrees with the label", (totals) => totals?.triage ?? "–"),
    line("mean words per note", (totals) => totals?.words ?? "–"),
    line("notes judged", (totals) => totals?.judged ?? "–"),
  ].join("\n");
  const perMoment = MOMENTS.map((moment, index) => {
    const cell = (variant: Variant) => {
      const row = byVariant[variant]?.[index];
      if (!row?.note) return "–";
      if (row.note.malformed) return "malformed ✗";
      if (row.note.delivery !== expectedDelivery(moment))
        return `${row.note.delivery} ✗`;
      if (row.note.delivery !== NudgeDelivery.Now)
        return `${row.note.delivery} ✓`;
      return row.score
        ? `${row.score.coaching}/${row.score.actionability}/${row.score.correctness}/${row.score.brevity}`
        : "spoke";
    };
    return `| ${moment.id} | ${moment.kind} | ${moment.lang} | ${VARIANTS.map(cell).join(" | ")} |`;
  }).join("\n");
  const summary = `# Coaching eval

Generated by \`bun evals/run.ts --summary\`. Judge: a fixed rubric (evals/rubric.ts), scores 1-5. Delivery is
checked against now/later/silent labels. Deferred observations count as quiet, but not as discarded; malformed replies fail delivery.
New nudges reply in JSON; the judge sees the single line visible in the collapsed live card.
Deferred observations are judged as wrap-up input. A malformed reply is dropped as in the app.
Direct asks run through a one-shot stand-in for the main coach with the transcript inlined, not the full agent.

${table}

Per moment, coaching/actionability/correctness/brevity:

| moment | kind | lang | ${VARIANTS.join(" | ")} |
|---|---|---|${VARIANTS.map(() => "---").join("|")}|
${perMoment}
`;
  await Bun.write(path.join(RESULTS, "summary.md"), summary);
  console.log(summary);
}

if (values.summary) {
  await writeSummary();
} else {
  const variant = VARIANTS.find((candidate) => candidate === values.variant);
  if (!variant) throw new Error("pass --variant old or --variant new");
  const only = values.only?.split(",");
  await runVariant(
    variant,
    MOMENTS.filter(
      (moment) =>
        (!only || only.includes(moment.id)) &&
        (!values.kind || moment.kind === values.kind),
    ),
  );
  console.log(`\n${calls} live calls`);
}
