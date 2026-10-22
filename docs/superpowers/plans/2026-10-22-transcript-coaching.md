# Transcript Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live coach answer from timestamped transcript evidence and identify actionable open loops without repeating nudges after they are resolved.

**Architecture:** Keep transcript reads in the existing `meeting__live_transcript` tool and keep proactive behavior in the current detect → triage → nudge pipeline. Tighten coach instructions and triage criteria; preserve current rate limits, budget controls, and multi-language handling.

**Tech Stack:** Bun, TypeScript, `bun:test`, Claude Agent SDK/Codex adapter.

**Spec:** [2026-10-22-transcript-aware-coach-design.md](../specs/2026-10-22-transcript-aware-coach-design.md)

## Global Constraints

- “It should say when the transcript is unclear or does not contain the answer rather than guessing.”
- “Nudges should be timely, specific to a line in the transcript, and suppressed when the issue is answered, resolved, or not actionable.”
- “Preserve existing spend, frequency, and user settings limits.”
- “The transcript may be in any language. Interpret it in that language, and say no when its meaning or language is unclear.”

## Review Focus

- An answer with no transcript support must say the evidence is missing; test the coach instructions and transcript retrieval contract without pinning exact copy.
- A quote from a non-English speaker must keep the correct speaker and timestamp; test with a seeded transcript containing both a non-English line and a second speaker.
- A question answered later in the triage window must not trigger an open-loop nudge; test with the unanswered question plus its answer in the same seeded input.
- A vague commitment with no owner/date remains actionable; test with a positive-control commitment next to a resolved commitment.
- Rapid duplicate nudges remain throttled; retain and run the existing cooldown/rate-limit tests.

---

### Task 1: Ground answers in transcript evidence

**Files:**

- Modify: `apps/coach/src/session.ts`
- Modify: `apps/coach/src/meeting-server.ts`
- Test: `apps/coach/src/transcript.test.ts`
- Create: `apps/coach/src/session.test.ts`

**Interfaces:**

- Consumes: `readLiveTranscript`, `renderTranscript`, and the `live_transcript({ since_ms? })` tool.
- Produces: coach instructions requiring transcript-backed answers, accurate speaker labels, useful timestamps, and an explicit uncertainty response when evidence is absent or ambiguous.

- [ ] **Step 1: Write failing tests** proving the coach prompt directs it to consult the transcript for claims about the meeting and the rendered transcript preserves speaker and timestamp evidence in a multilingual fixture.
- [ ] **Step 2: Run the focused tests and confirm the new assertions fail for the missing guidance or evidence.**

Run: `cd apps/coach && bun test src/session.test.ts src/transcript.test.ts`

Expected: New contract tests fail while existing transcript formatting tests pass.

- [ ] **Step 3: Add concise evidence, uncertainty, and selective low-latency project-context instructions in `COACH_PROMPT`; preserve the existing transcript tool and line format unless the test exposes a missing evidence field.**
- [ ] **Step 4: Run the focused tests.**

Run: `cd apps/coach && bun test src/session.test.ts src/transcript.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit** with `feat: ground coach answers in transcript evidence`.

### Task 2: Detect unresolved questions and commitments

**Files:**

- Modify: `apps/coach/src/triage.ts`
- Modify: `apps/coach/src/triage.test.ts`
- Modify: `apps/coach/src/proactive.test.ts`

**Interfaces:**

- Consumes: `TriageRequest { context, kinds, lines }` and the current 90-second triage window.
- Produces: triage behavior that considers later lines before deciding a question or commitment remains open; unchanged `TriageResult` and spend accounting.

- [ ] **Step 1: Add failing behavior tests** for a question followed by a clear answer, and for a vague commitment followed by a positive control that remains unresolved. Seed both cases in the same test data so a quiet verdict cannot pass because no trigger was present.
- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `cd apps/coach && bun test src/triage.test.ts src/proactive.test.ts`

Expected: The new resolution-aware cases fail or the prompt contract lacks the required resolution check.

- [ ] **Step 3: Update `TRIAGE_SYSTEM` to distinguish unresolved from answered/resolved moments and to retain the current “when unsure, say no” rule.** Do not change debounce, rate, budget, or nudge-window constants.
- [ ] **Step 4: Update an existing deterministic evaluation fixture only if one already covers triage quality; otherwise keep this change within the behavior tests above.**
- [ ] **Step 5: Run focused tests and the existing proactive suite.**

Run: `cd apps/coach && bun test src/triage.test.ts src/proactive.test.ts`

Expected: PASS, including existing cooldown, cost cap, and multilingual tests.

- [ ] **Step 6: Commit** with `feat: suppress resolved transcript nudges`.

### Task 3: Verify coach package and sidecar

**Files:**

- Validate: `apps/coach`

- [ ] **Step 1: Run `bun run typecheck` and `bun test` from `apps/coach`.**
- [ ] **Step 2: Run `bun run build:sidecar` and verify a successful exit.**
- [ ] **Step 3: Commit any test/evaluation fixture updates** with `test: cover transcript-grounded coaching`.
