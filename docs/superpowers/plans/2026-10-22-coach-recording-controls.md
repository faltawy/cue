# Coach Recording Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coach stop, pause, and resume Cue’s active recording on explicit request, keeping pause/resume within the same meeting and never controlling the meeting app.

**Architecture:** Add a paused state and pause/resume transitions to the listener root/session/source actors while preserving the same logical session and recorder timeline. Expose a narrow status/control API through the coach bridge and MCP tools; record a distinct intentional-pause gap, keep the session reserved while paused, and never auto-resume after process restart.

**Tech Stack:** Rust, Tokio, Ractor, Tauri, Axum, Bun, TypeScript, SQLx, `cargo test`, `bun:test`.

**Spec:** [2026-10-22-transcript-aware-coach-design.md](../specs/2026-10-22-transcript-aware-coach-design.md)

## Global Constraints

- “Recording controls run only in response to a clear user command, and only affect the active Cue recording.”
- “Pause must stop audio capture, not merely silence transcription or hide audio from the transcript.”
- “Paused is a distinct capture state: it keeps the current meeting reserved and stoppable, but is not reported as actively recording.”
- “Process restart must never auto-resume audio capture; interrupted-session behavior follows Cue's existing recovery path.”
- “The coach does not start recordings, discard audio, or control Zoom/Meet/other meeting-app state.”

## Review Focus

- A duplicate start while paused must be rejected and preserve the current session; test the same active session through the listener root.
- Stop while paused must finalize exactly once and preserve existing recovery/finalization; seed the paused session and assert its transcript/audio finalization outcome.
- Resume after an audio-device failure must not report active capture until the source is healthy; test failure then recovery with a positive healthy control.
- Pause/resume must not append or transcribe frames during the paused interval; test a fake source/recorder timeline with frames before and after the gap.
- A recording request with no active Cue session must not start a recording; test inactive and finalizing snapshots against a seeded active snapshot.

---

### Task 1: Model paused capture state and root transitions

**Files:**

- Modify: `crates/listener-core/src/lib.rs`
- Modify: `crates/listener-core/src/actors/root.rs`
- Modify: `crates/listener-core/src/actors/session/types.rs`
- Modify: `crates/listener-core/src/actors/session/supervisor.rs`
- Test: `crates/listener-core/src/actors/session/reliability_tests.rs`

**Interfaces:**

- Consumes: current `RootMsg::{StartSession, StopSession, GetSnapshot}` and `Snapshot`.
- Produces: `State::Paused`, `RootMsg::PauseSession`, `RootMsg::ResumeSession`, and snapshot semantics where `active_session_id` remains set while paused; stop remains available from active or paused states.

- [ ] **Step 1: Write failing actor tests** for active → paused → active within the same session, start rejected while paused, stop from paused finalizes once, and resume rejected after finalization.
- [ ] **Step 2: Run `cargo test -p listener-core actors::session::reliability_tests` and confirm failures.**
- [ ] **Step 3: Add root/session actor pause state and transitions. Keep actor lifetime choices internal, but preserve the same logical session and recorder; do not report paused as active capture.**
- [ ] **Step 4: Run the focused listener-core tests.**

Expected: PASS, including the pre-existing start/stop/recovery tests.

- [ ] **Step 5: Commit** with `feat: model paused meeting capture`.

### Task 2: Stop audio capture during pause and preserve a distinct gap

**Files:**

- Modify: `crates/listener-core/src/actors/source/mod.rs`
- Modify: `crates/listener-core/src/actors/session/supervisor.rs`
- Modify: `crates/listener-core/src/actors/session/supervisor/children.rs`
- Modify: `plugins/transcription/src/capture_gaps.rs`
- Modify: `plugins/transcription/src/listener/runtime.rs`
- Modify: `plugins/transcription/src/listener/ext.rs`
- Test: `plugins/transcription/src/capture_gaps.rs`

**Interfaces:**

- Consumes: root/session pause and resume transitions from Task 1.
- Produces: `pause_capture()` and `resume_capture()` listener operations; source audio streams do not feed recorder or transcription while paused; the capture gap API distinguishes an intentional pause from an upstream transcription outage.

- [ ] **Step 1: Add failing tests** that open/close an intentional pause interval and distinguish it from a provider interruption, plus a source-level test showing no frames reach recorder/listener while paused.
- [ ] **Step 2: Run `cargo test -p tauri-plugin-transcription capture_gaps::` and focused listener-core tests; confirm new assertions fail.**
- [ ] **Step 3: Add pause/resume commands at the listener extension/root boundary and stop/restart the source streams without ending the session or recorder. Keep the live transcript engine available so resumed speech continues in the same transcript.**
- [ ] **Step 4: Add an intentional-pause marker to `CaptureGapRegistry`; preserve existing outage, storage-failure, and confirmed-through semantics.**
- [ ] **Step 5: Run `cargo test -p listener-core` and `cargo test -p tauri-plugin-transcription`.**

Expected: PASS; no audio frames are accepted during pause, and downstream playback/transcript consumers can tell the intentional gap from transcription failure.

- [ ] **Step 6: Commit** with `feat: pause capture without ending the meeting`.

### Task 3: Expose paused state in app bindings and lifecycle UI

**Files:**

- Modify: `plugins/transcription/src/listener/commands.rs`
- Regenerate: `plugins/transcription/js/bindings.gen.ts`
- Modify: `apps/desktop/src/store/zustand/listener/general-live.ts`
- Modify: `apps/desktop/src/session/components/outer-header/index.tsx`
- Modify: `apps/desktop/src/stt/resume-listening.ts`
- Test: `apps/desktop/src/store/zustand/listener/general.test.ts`
- Test: relevant header/resume-listening tests

**Interfaces:**

- Consumes: `State::Paused` and capture pause/resume commands from Task 2.
- Produces: app state and controls that display paused status, offer Resume/Stop, prevent a second session from starting, and never auto-resume a paused session after restart.

- [ ] **Step 1: Add failing frontend tests** for paused state rendering, stop/resume controls, blocked second start, and startup recovery that remains paused/stopped rather than silently resuming audio.
- [ ] **Step 2: Add Specta commands for pause/resume and regenerate bindings through the owning generator.**
- [ ] **Step 3: Update listener Zustand state and header controls to represent paused explicitly; route actions through the generated commands.**
- [ ] **Step 4: Update resume/recovery handling so a process restart never begins new capture without a fresh user action.**
- [ ] **Step 5: Run focused UI tests and `pnpm -F @anlg/desktop typecheck`.**

Expected: PASS; paused remains reserved but is never presented as recording.

- [ ] **Step 6: Commit** with `feat: expose paused recording state`.

### Task 4: Add explicit coach recording tools

**Files:**

- Modify: `plugins/coach/src/bridge.rs`
- Modify: `plugins/coach/src/lib.rs`
- Modify: `apps/coach/src/app-bridge.ts`
- Modify: `apps/coach/src/app-bridge.test.ts`
- Modify: `apps/coach/src/meeting-server.ts`
- Modify: `apps/coach/src/session.ts`
- Modify: `apps/coach/src/turn-events.ts`
- Test: `apps/coach/src/meeting-server.test.ts`
- Test: `apps/coach/src/turn-events.test.ts`

**Interfaces:**

- Consumes: `GET /recording/status`, `POST /recording/stop`, `POST /recording/pause`, and `POST /recording/resume`, backed by listener commands from Task 2.
- Produces: read-only `recording_status()` and explicit-only `control_recording({ action: "stop" | "pause" | "resume" })`; no start/discard action.

- [ ] **Step 1: Write failing bridge/tool tests** for active status, stop finalization, pause/resume same session, inactive/finalizing error responses, and tool descriptions requiring a direct user command.
- [ ] **Step 2: Run focused Rust bridge and Bun tests; confirm failure.**
- [ ] **Step 3: Add authenticated bridge endpoints that route only to the active Cue listener and return the resulting state. Do not select sessions from model-provided IDs.**
- [ ] **Step 4: Add typed app bridge methods and MCP tools; update coach instructions to use them only for explicit stop/pause/resume requests, never because the conversation suggests ending.**
- [ ] **Step 5: Add tool-event labels and run `cd apps/coach && bun run typecheck && bun test`.**
- [ ] **Step 6: Run `cargo test -p tauri-plugin-coach` and `cargo check --locked -p desktop --features dev`.**

Expected: PASS; coach controls only Cue’s active recording and reports its actual state.

- [ ] **Step 7: Commit** with `feat: let coach control Cue recording`.
