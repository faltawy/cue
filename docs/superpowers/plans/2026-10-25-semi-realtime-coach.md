# Semi-Realtime Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make live nudges arrive after natural pauses, stay relevant to the latest transcript, and remain measurable without increasing the current call cadence or spend limits.

**Architecture:** Keep the existing local cue detector, fast nudge path, AI triage fallback, and cadence limits. Treat each triage as a decision about a particular transcript snapshot; if the transcript materially changes before the result is ready, suppress that stale decision and let the normal observe loop consider the newer conversation. Preserve existing latency, cost, and feedback metrics.

**Tech Stack:** Bun, TypeScript, Cue coach sidecar.

**Spec:** User-approved semi-realtime coaching behavior from the conversation; existing behavior documented in `docs/coach.md#nudges`.

## Global Constraints

- Keep the 1.8-second pause threshold, 8-second maximum hold, 15-second triage gap, one-nudge-per-minute limit, and four-per-ten-minutes limit unchanged.
- Preserve local-only nudge feedback and existing cost accounting.
- Do not add always-on model calls or widen transcript context beyond the existing bounded window.
- Do not run or add tests unless the user requests testing or verification.

## Review Focus

- A transcript update arriving while triage is in flight must not allow an obsolete verdict to produce a nudge.
- A new meeting or stopped recording must not receive a nudge from an earlier triage result.
- A stale result must not silently consume the nudge quota or prevent later transcript from being considered.
- Clear fast cues must retain their existing low-latency route and cadence limits.
- Triage failure and provider latency must preserve current cost and outcome accounting.

---

### Task 1: Suppress stale triage results

**Files:**

- Modify: `apps/coach/src/proactive.ts`

**Interfaces:**

- Use the existing transcript activity key as the snapshot identity; do not add a new public API.
- Keep `ProactiveMetric` outcomes and current quota semantics.

- [ ] Capture the activity key and live meeting state when triage starts.
- [ ] Before dispatching a triage-approved nudge, compare the captured snapshot with the latest state; if it changed or recording stopped, emit a `suppressed` metric and do not dispatch.
- [ ] Ensure suppressed stale results do not update `lastNudgeAt` or `nudgedAt`.
- [ ] Retain the existing fallback error, silence, spend, and latency metrics.

### Task 2: Document the live behavior and its limits

**Files:**

- Modify: `docs/coach.md`

**Interfaces:**

- Describe the current fast local cue path and the bounded AI triage path in user-facing terms.

- [ ] Clarify that Cue waits for a pause, checks whether a cue remains open, and suppresses an outdated result if the conversation changes during analysis.
- [ ] Keep the published pause and nudge rate limits aligned with `PROACTIVE_DEFAULTS`.
- [ ] Do not promise a fixed response-time SLA; provider latency varies.
