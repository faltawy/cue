import {
  DEFAULT_COACHING,
  type MeetingCoaching,
  MeetingIntent,
} from "./coaching-preferences";
import { detectHits, type Hit, HitKind } from "./detect";
import { NudgeOutcome } from "./nudge-outcome";
import { NO_SPEND, type Spend } from "./pricing";
import { monologue } from "./talk-time";
import { formatTimestamp } from "./timestamp";
import type { TranscriptLine } from "./transcript";
import type { TriageRequest, TriageResult } from "./triage";

export enum NudgePath {
  Fast = "fast",
  Fallback = "fallback",
}

export enum ProactiveState {
  On = "on",
  Off = "off",
  Quiet = "quiet",
  Capped = "capped",
  Unpriced = "unpriced",
}

export const PROACTIVE_DEFAULTS = {
  pauseMs: 1_800,
  deliveryTtlMs: 30_000,
  hitTtlMs: 90_000,
  triageGapMs: 15_000,
  nudgeGapMs: 60_000,
  rateWindowMs: 10 * 60_000,
  rateMax: 4,
  windowMs: 90_000,
  capUsd: 0.5,
  monologueMs: 90_000,
  monologueGapMs: 5 * 60_000,
};

export type ProactiveConfig = typeof PROACTIVE_DEFAULTS & { enabled: boolean };
export enum SpendSource {
  Nudges = "nudges",
  Asks = "asks",
}
export type ProactiveView = {
  state: ProactiveState;
  nudgesUsd: number | null;
  capUsd: number;
  meetingUsd: number | null;
  meetingTokens: number;
  cachedTokens: number;
};
export type NudgeRequest = {
  revision: number;
  intent: MeetingIntent;
  context: string;
  hits: Hit[];
  why: string;
  lines: readonly TranscriptLine[];
  path: NudgePath;
  observedAtMs: number;
  priorSpend: Spend;
};
export enum NudgeDispatch {
  Started = "started",
  Retry = "retry",
  Drop = "drop",
}
export type ProactiveMetric = {
  path: NudgePath;
  outcome: NudgeOutcome;
  latencyMs: number;
  modelCalls: number;
  tokens: number;
  cachedTokens: number;
};
export type Observed = {
  lines: readonly TranscriptLine[];
  pending: string;
  live: boolean;
  selfName: string | null;
};

export type ProactiveDeps = {
  triage(request: TriageRequest): Promise<TriageResult>;
  nudge(request: NudgeRequest): NudgeDispatch;
  busy(): boolean;
  context(): string;
  changed(view: ProactiveView): void;
  metric(metric: ProactiveMetric): void;
  now?: () => number;
};

type HeldHit = Hit & { seenAt: number };

export function isFastCue(hit: Hit): boolean {
  return (
    hit.kind === HitKind.Question ||
    hit.kind === HitKind.Objection ||
    hit.kind === HitKind.Commitment
  );
}

export function monologueNudge(
  lines: readonly TranscriptLine[],
  minMs: number,
): { startMs: number; hit: Hit; why: string } | null {
  const stretch = monologue(lines);
  const last = stretch && lines[stretch.lineIndex];
  if (!stretch || !last || stretch.ms < minMs) return null;
  return {
    startMs: stretch.startMs,
    hit: {
      kind: HitKind.Monologue,
      lineIndex: stretch.lineIndex,
      text: last.text,
    },
    why: `You have talked for ${formatTimestamp(stretch.ms)} without handing over`,
  };
}

export class Proactive {
  private readonly now: () => number;
  private lines: readonly TranscriptLine[] = [];
  private live = false;
  private liveEpoch = 0;
  private scanned = 0;
  private scanFloor = 0;
  private readonly reported = new Set<string>();
  private activityKey = "";
  private revision = 0;
  private pending = "";
  private coaching = DEFAULT_COACHING;
  private carefulTiming = false;
  private lastActivityAt: number;
  private held: HeldHit[] = [];
  private lastTriageAt = Number.NEGATIVE_INFINITY;
  private triagedLineCount = 0;
  private readonly fastHandledLines = new Set<number>();
  private lastNudgeAt = Number.NEGATIVE_INFINITY;
  private lastMonologueAt = Number.NEGATIVE_INFINITY;
  private monologueNudged: number | null = null;
  private nudgedAt: number[] = [];
  private triaging = false;
  private nudgesUsd: number | null = 0;
  private meeting: Spend = { usd: 0, tokens: 0, cachedTokens: 0 };

  constructor(
    private readonly config: ProactiveConfig,
    private readonly deps: ProactiveDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.lastActivityAt = this.now();
  }

  observe(input: Observed) {
    const now = this.now();
    this.lines = input.lines;
    if (this.live !== input.live) {
      this.liveEpoch += 1;
      this.revision += 1;
    }
    this.live = input.live;
    this.pending = input.pending;
    const latestEnd = input.lines.at(-1)?.end_ms ?? 0;
    const recentLines = input.lines
      .filter((line) => line.end_ms >= latestEnd - this.config.windowMs)
      .map(({ speaker, start_ms, end_ms, text }) => [
        speaker,
        start_ms,
        end_ms,
        text,
      ]);
    const key = JSON.stringify([recentLines, input.pending]);
    if (key !== this.activityKey) {
      this.revision += 1;
      this.activityKey = key;
      this.lastActivityAt = now;
    }
    if (!this.config.enabled || !input.live || this.coaching.quiet) return;

    const paused = this.atOpening(now);
    this.scan(
      input,
      paused ? input.lines.length : input.lines.length - 1,
      input.selfName,
      now,
    );
    this.held = this.held.filter(
      (hit) => now - hit.seenAt < this.config.hitTtlMs,
    );
    if (this.fastDue(now, paused)) return;
    if (this.due(now, paused)) this.triage(now);
    else if (paused) this.handOver(now);
  }

  setCoaching(coaching: MeetingCoaching, carefulTiming = false) {
    if (
      this.coaching.intent === coaching.intent &&
      this.coaching.quiet === coaching.quiet &&
      this.carefulTiming === carefulTiming
    )
      return;
    this.coaching = { intent: coaching.intent, quiet: coaching.quiet };
    this.carefulTiming = carefulTiming;
    this.revision += 1;
    this.held = [];
    this.scanned = this.lines.length;
    this.scanFloor = this.lines.length;
    this.triagedLineCount = this.lines.length;
    this.deps.changed(this.view());
  }

  canDeliver(request: NudgeRequest): boolean {
    return (
      this.config.enabled &&
      this.live &&
      !this.coaching.quiet &&
      request.revision === this.revision &&
      this.atOpening(this.now()) &&
      this.now() - request.observedAtMs < this.config.deliveryTtlMs
    );
  }

  private atOpening(now: number): boolean {
    return (
      !this.pending.trim() &&
      now - this.lastActivityAt >=
        (this.carefulTiming
          ? Math.max(3_000, this.config.pauseMs)
          : this.config.pauseMs)
    );
  }

  spend(source: SpendSource, cost: Spend) {
    if (cost.usd !== null && cost.usd <= 0 && cost.tokens <= 0) return;
    if (source === SpendSource.Nudges)
      this.nudgesUsd =
        this.nudgesUsd === null || cost.usd === null
          ? null
          : this.nudgesUsd + cost.usd;
    this.meeting = {
      usd:
        this.meeting.usd === null || cost.usd === null
          ? null
          : this.meeting.usd + cost.usd,
      tokens: this.meeting.tokens + cost.tokens,
      cachedTokens: this.meeting.cachedTokens + cost.cachedTokens,
    };
    this.deps.changed(this.view());
  }

  caughtUp() {
    this.lastNudgeAt = this.now();
  }

  view(): ProactiveView {
    const state: ProactiveState = !this.config.enabled
      ? ProactiveState.Off
      : this.coaching.quiet
        ? ProactiveState.Quiet
        : this.nudgesUsd === null
          ? ProactiveState.Unpriced
          : this.capped()
            ? ProactiveState.Capped
            : ProactiveState.On;
    return {
      state,
      nudgesUsd: this.nudgesUsd,
      capUsd: this.config.capUsd,
      meetingUsd: this.meeting.usd,
      meetingTokens: this.meeting.tokens,
      cachedTokens: this.meeting.cachedTokens,
    };
  }

  reportMetric(metric: ProactiveMetric) {
    this.deps.metric(metric);
  }

  private capped(): boolean {
    return (
      this.nudgesUsd === null ||
      Math.round(this.nudgesUsd * 1e6) >= Math.round(this.config.capUsd * 1e6)
    );
  }

  private rateLimited(now: number): boolean {
    this.nudgedAt = this.nudgedAt.filter(
      (at) => now - at < this.config.rateWindowMs,
    );
    return this.nudgedAt.length >= this.config.rateMax;
  }

  private scan(
    input: Observed,
    finalCount: number,
    selfName: string | null,
    now: number,
  ) {
    const from = Math.max(
      this.scanFloor,
      Math.min(this.scanned, input.lines.length) - 1,
    );
    for (let index = from; index < finalCount; index += 1) {
      const line = input.lines[index];
      if (!line) continue;
      for (const hit of detectHits(line, index, selfName)) {
        const id = `${index}:${hit.kind}`;
        if (this.reported.has(id)) continue;
        this.reported.add(id);
        this.held.push({ ...hit, seenAt: now });
      }
    }
    this.scanned = Math.max(this.scanned, finalCount);
  }

  private blocked(now: number): boolean {
    return (
      this.triaging ||
      this.coaching.quiet ||
      this.capped() ||
      this.rateLimited(now) ||
      this.deps.busy()
    );
  }

  private due(now: number, paused: boolean): boolean {
    const first = this.held[0];
    if (this.blocked(now)) return false;
    if (!this.lines.length) return false;
    if (!first && now - this.lastActivityAt > this.config.hitTtlMs)
      return false;
    if (!first && !this.hasUntriagedLines()) return false;
    if (!paused) return false;
    return (
      now - this.lastTriageAt >= this.config.triageGapMs &&
      now - this.lastNudgeAt >= this.config.nudgeGapMs
    );
  }

  private fastDue(now: number, paused: boolean): boolean {
    const hits = this.held.filter(isFastCue);
    const first = hits[0];
    if (!first || this.blocked(now) || !this.lines.length) return false;
    if (now - first.seenAt >= this.config.hitTtlMs) return false;
    if (!paused) return false;
    if (now - this.lastNudgeAt < this.config.nudgeGapMs) return false;

    const sent = hits.map(({ seenAt: _seenAt, ...hit }) => hit);
    const request: NudgeRequest = {
      revision: this.revision,
      intent: this.coaching.intent,
      context: this.deps.context(),
      hits: sent,
      why: `Fast local cue: ${sent.map((hit) => hit.kind).join(", ")}`,
      lines: this.lines,
      path: NudgePath.Fast,
      observedAtMs: Math.min(...hits.map((hit) => hit.seenAt)),
      priorSpend: NO_SPEND,
    };
    const dispatch = this.deps.nudge(request);
    if (dispatch === NudgeDispatch.Retry) return true;
    for (const hit of hits) this.fastHandledLines.add(hit.lineIndex);
    this.held = this.held.filter((hit) => !isFastCue(hit));
    if (dispatch === NudgeDispatch.Drop) return true;
    this.lastNudgeAt = now;
    this.nudgedAt.push(now);
    return true;
  }

  private handOver(now: number) {
    if (this.lines.length <= this.scanFloor) return;
    if (
      this.coaching.intent === MeetingIntent.Presenting ||
      this.coaching.intent === MeetingIntent.Listening
    )
      return;
    const stretch = monologueNudge(this.lines, this.config.monologueMs);
    if (!stretch || stretch.startMs === this.monologueNudged) return;
    if (
      now - this.lastMonologueAt < this.config.monologueGapMs ||
      now - this.lastNudgeAt < this.config.nudgeGapMs
    )
      return;
    if (this.blocked(now)) return;
    const request: NudgeRequest = {
      revision: this.revision,
      intent: this.coaching.intent,
      context: this.deps.context(),
      hits: [stretch.hit],
      why: stretch.why,
      lines: this.lines,
      path: NudgePath.Fast,
      observedAtMs: now,
      priorSpend: NO_SPEND,
    };
    if (this.deps.nudge(request) !== NudgeDispatch.Started) return;
    this.monologueNudged = stretch.startMs;
    this.lastMonologueAt = now;
    this.lastNudgeAt = now;
    this.nudgedAt.push(now);
  }

  private hasUntriagedLines(): boolean {
    for (
      let index = this.triagedLineCount;
      index < this.lines.length;
      index += 1
    ) {
      if (!this.fastHandledLines.has(index)) return true;
    }
    return false;
  }

  private triage(now: number) {
    const hits: Hit[] = this.held.map(({ seenAt: _seenAt, ...hit }) => hit);
    const observedAtMs = this.held.length
      ? Math.min(...this.held.map((hit) => hit.seenAt))
      : this.lastActivityAt;
    this.held = [];
    this.triaging = true;
    this.lastTriageAt = now;
    this.triagedLineCount = this.lines.length;
    for (const index of this.fastHandledLines) {
      if (index < this.triagedLineCount) this.fastHandledLines.delete(index);
    }
    const latestEnd = this.lines.at(-1)?.end_ms ?? 0;
    const kinds = [...new Set<HitKind>(hits.map((hit) => hit.kind))];
    const context = this.deps.context();
    const activityKey = this.activityKey;
    const liveEpoch = this.liveEpoch;
    const revision = this.revision;
    this.deps
      .triage({
        intent: this.coaching.intent,
        context,
        kinds,
        lines: this.lines.filter(
          (line) => line.end_ms >= latestEnd - this.config.windowMs,
        ),
      })
      .then((result) => {
        this.spend(SpendSource.Nudges, result.spend);
        if (
          !result.verdict?.nudge ||
          !this.live ||
          this.activityKey !== activityKey ||
          this.liveEpoch !== liveEpoch ||
          this.revision !== revision ||
          this.capped() ||
          this.deps.busy()
        ) {
          this.deps.metric({
            path: NudgePath.Fallback,
            outcome: !result.verdict?.nudge
              ? NudgeOutcome.Silence
              : NudgeOutcome.Suppressed,
            latencyMs: Math.max(0, this.now() - observedAtMs),
            modelCalls: 1,
            tokens: result.spend.tokens,
            cachedTokens: result.spend.cachedTokens,
          });
          return;
        }
        const dispatch = this.deps.nudge({
          revision,
          intent: this.coaching.intent,
          context,
          hits,
          why: result.verdict.why,
          lines: this.lines,
          path: NudgePath.Fallback,
          observedAtMs,
          priorSpend: result.spend,
        });
        if (dispatch !== NudgeDispatch.Started) {
          this.deps.metric({
            path: NudgePath.Fallback,
            outcome: NudgeOutcome.Suppressed,
            latencyMs: Math.max(0, this.now() - observedAtMs),
            modelCalls: 1,
            tokens: result.spend.tokens,
            cachedTokens: result.spend.cachedTokens,
          });
          return;
        }
        const at = this.now();
        this.lastNudgeAt = at;
        this.nudgedAt.push(at);
      })
      .catch((error: unknown) => {
        console.error("[coach] triage failed; not nudging", {
          _e: error instanceof Error ? error.message : String(error),
          kinds,
        });
        this.deps.metric({
          path: NudgePath.Fallback,
          outcome: NudgeOutcome.Error,
          latencyMs: Math.max(0, this.now() - observedAtMs),
          modelCalls: 1,
          tokens: 0,
          cachedTokens: 0,
        });
      })
      .finally(() => {
        this.triaging = false;
      });
  }
}
