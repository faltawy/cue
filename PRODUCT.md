# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People in live customer-facing calls (sales, customer success, client meetings) who want private help while they talk. They glance at the coach in the corner of Google Meet mid-conversation, often for about a second, without the other side noticing.

## Product Purpose

Cue is a macOS meeting notepad with a live coach. It records the meeting, keeps a transcript, and runs a private coach that speaks up when something needs the person (a question, a promise, a number) and answers when asked. The Meet extension brings that coach into the call itself. Success is the person saying the right thing at the right moment and leaving the call with nothing dropped.

## Positioning

The coach works from Cue's own recording and transcript of this call, plus what the extension can see in Meet (captions, chat, participants, shared screen), and it stays private to the person. It can point at things in the meeting itself, such as highlighting an element with a tooltip.

## Operating Context

- Google Meet in Brave or another Chromium browser, with the Cue desktop app recording at the same time. The extension talks to the app over native messaging.
- The person's attention is on the conversation. The panel competes with faces, slides and Meet's own controls.
- Calls and transcripts are often in Arabic; the UI language may be right-to-left.
- The same coach UI (`packages/assistant`) runs in the desktop app's coach panel and floating windows.

## Capabilities and Constraints

- Proactive cues and on-demand chat carry equal weight: the panel surfaces a glanceable next move and is always ready for a question (catch me up, promises so far, what did they just ask).
- Meeting tools: catch-up, promises, open questions, meeting memory, screen help, private parking lot, meeting goal, close-out.
- Recording handoff: the panel asks before recording a call and before replacing a recording that is already running.
- Stay out of the call: never cover faces or Meet controls, small and minimizable, and nothing private visible to others if the tab is shared.
- The desktop coach and the Meet panel must stay one product: changes to the shared coach UI apply to both.
- Arabic and right-to-left layout must work.
- The debug drawer (test tooltip, test highlight, export diagnostics, clear log) stays reachable.

## Brand Commitments

- Name: Cue. The coach is "Coach" and is private ("Only you").
- `docs/design/cue.md` is the binding design spec for the app UI.

## Product Principles

1. Glance first: anything shown during a call must be readable in about a second.
2. Private by default: nothing the coach shows should be visible or audible to the other side.
3. Ask before acting on the meeting: recording and replacing recordings need the person's yes.
4. One coach everywhere: the Meet panel and the desktop coach behave and look like the same product.

## Accessibility & Inclusion

Right-to-left layout and Arabic text are first-class.
