import { detectHits, type Hit, type HitKind } from "./detect";
import type { Spend } from "./pricing";
import type { TranscriptLine } from "./transcript";
import type { TriageRequest, TriageResult } from "./triage";

export const PROACTIVE_DEFAULTS = {
  pauseMs: 1_800,
  maxHoldMs: 8_000,
  hitTtlMs: 90_000,
  triageGapMs: 15_000,
  nudgeGapMs: 60_000,
  rateWindowMs: 10 * 60_000,
  rateMax: 4,
  windowMs: 90_000,
  capUsd: 0.5,
};

export type ProactiveConfig = typeof PROACTIVE_DEFAULTS & { enabled: boolean };
export type SpendSource = "nudges" | "asks";
export type ProactiveView = {
  state: "on" | "off" | "capped";
  nudgesUsd: number;
  capUsd: number;
  meetingUsd: number;
  meetingTokens: number;
  cachedTokens: number;
};
export type NudgeRequest = { context: string; hits: Hit[]; why: string; lines: readonly TranscriptLine[] };
export type Observed = { lines: readonly TranscriptLine[]; pending: string; live: boolean; selfName: string | null };

export type ProactiveDeps = {
  triage(request: TriageRequest): Promise<TriageResult>;
  nudge(request: NudgeRequest): boolean;
  busy(): boolean;
  context(): string;
  changed(view: ProactiveView): void;
  now?: () => number;
};

type HeldHit = Hit & { seenAt: number };

export class Proactive {
  private readonly now: () => number;
  private lines: readonly TranscriptLine[] = [];
  private scanned = 0;
  private readonly reported = new Set<string>();
  private activityKey = "";
  private lastActivityAt: number;
  private held: HeldHit[] = [];
  private lastTriageAt = Number.NEGATIVE_INFINITY;
  private lastNudgeAt = Number.NEGATIVE_INFINITY;
  private nudgedAt: number[] = [];
  private triaging = false;
  private nudgesUsd = 0;
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
    const last = input.lines.at(-1);
    const key = `${input.lines.length}:${last?.end_ms ?? 0}:${last?.text.length ?? 0}:${input.pending}`;
    if (key !== this.activityKey) {
      this.activityKey = key;
      this.lastActivityAt = now;
    }
    if (!this.config.enabled || !input.live) return;

    const paused = now - this.lastActivityAt >= this.config.pauseMs;
    this.scan(input, paused ? input.lines.length : input.lines.length - 1, input.selfName, now);
    this.held = this.held.filter((hit) => now - hit.seenAt < this.config.hitTtlMs);
    if (this.due(now, paused)) this.triage(now);
  }

  spend(source: SpendSource, cost: Spend) {
    if (cost.usd <= 0 && cost.tokens <= 0) return;
    if (source === "nudges") this.nudgesUsd += cost.usd;
    this.meeting = {
      usd: this.meeting.usd + cost.usd,
      tokens: this.meeting.tokens + cost.tokens,
      cachedTokens: this.meeting.cachedTokens + cost.cachedTokens,
    };
    this.deps.changed(this.view());
  }

  caughtUp() {
    this.lastNudgeAt = this.now();
  }

  view(): ProactiveView {
    const state = !this.config.enabled ? "off" : this.capped() ? "capped" : "on";
    return {
      state,
      nudgesUsd: this.nudgesUsd,
      capUsd: this.config.capUsd,
      meetingUsd: this.meeting.usd,
      meetingTokens: this.meeting.tokens,
      cachedTokens: this.meeting.cachedTokens,
    };
  }

  private capped(): boolean {
    return Math.round(this.nudgesUsd * 1e6) >= Math.round(this.config.capUsd * 1e6);
  }

  private rateLimited(now: number): boolean {
    this.nudgedAt = this.nudgedAt.filter((at) => now - at < this.config.rateWindowMs);
    return this.nudgedAt.length >= this.config.rateMax;
  }

  private scan(input: Observed, finalCount: number, selfName: string | null, now: number) {
    const from = Math.max(0, Math.min(this.scanned, input.lines.length) - 1);
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

  private due(now: number, paused: boolean): boolean {
    const first = this.held[0];
    if (!first || this.triaging || this.capped() || this.rateLimited(now) || this.deps.busy()) return false;
    if (!paused && now - first.seenAt < this.config.maxHoldMs) return false;
    return now - this.lastTriageAt >= this.config.triageGapMs && now - this.lastNudgeAt >= this.config.nudgeGapMs;
  }

  private triage(now: number) {
    const hits: Hit[] = this.held.map(({ seenAt: _seenAt, ...hit }) => hit);
    this.held = [];
    this.triaging = true;
    this.lastTriageAt = now;
    const latestEnd = this.lines.at(-1)?.end_ms ?? 0;
    const kinds = [...new Set<HitKind>(hits.map((hit) => hit.kind))];
    const context = this.deps.context();
    this.deps
      .triage({
        context,
        kinds,
        lines: this.lines.filter((line) => line.end_ms >= latestEnd - this.config.windowMs),
      })
      .then((result) => {
        this.spend("nudges", result.spend);
        if (!result.verdict?.nudge || this.capped() || this.deps.busy()) return;
        if (!this.deps.nudge({ context, hits, why: result.verdict.why, lines: this.lines })) return;
        const at = this.now();
        this.lastNudgeAt = at;
        this.nudgedAt.push(at);
      })
      .catch((error: unknown) => {
        console.error("[coach] triage failed; not nudging", {
          _e: error instanceof Error ? error.message : String(error),
          kinds,
        });
      })
      .finally(() => {
        this.triaging = false;
      });
  }
}
