import {
  commands,
  type RenderTranscriptRequest,
  type RenderedTranscriptSegment,
} from "@anlg/plugin-transcription";

import type { ListenerState } from "./route-state";

import { SegmentKeyUtils, SpeakerLabelManager } from "~/stt/live-segment";
import { buildSpeakerResolutionInput } from "~/stt/useResolvedSpeakerSegments";

export type FloatingSpeakerLabel = { label: string; humanId?: string };
export type FloatingSpeakerLabels = ReadonlyMap<string, FloatingSpeakerLabel>;

// Labels the floating panel's live segments with the same native resolver the
// transcript tab uses. The latest answer wins; the previous one stays on screen
// only while a newer request is in flight, and everything resets with the session.
// A live segment's id changes with every word it gains, so until the resolver
// answers for the new id it keeps the label last resolved for its segment key.
export function createFloatingSpeakerLabeler(onChange: () => void) {
  let sessionId: string | null = null;
  let generation = 0;
  let labels = new Map<string, FloatingSpeakerLabel>();
  let labelsByKey = new Map<string, FloatingSpeakerLabel>();
  // Anonymous numbers are first-seen for the whole session, like the tab, so
  // evicting old segments from the bounded live window cannot renumber a voice.
  let numbering = new SpeakerLabelManager();
  const clear = () => {
    generation += 1;
    labelsByKey = new Map();
    if (labels.size > 0) {
      labels = new Map();
      onChange();
    }
  };

  return {
    get labels(): FloatingSpeakerLabels {
      return labels;
    },
    update(
      nextSessionId: string | null,
      segments: ListenerState["liveSegments"],
      request: RenderTranscriptRequest | null,
    ) {
      if (sessionId !== nextSessionId) {
        sessionId = nextSessionId;
        numbering = new SpeakerLabelManager();
        labelsByKey = new Map();
      }
      const input = sessionId
        ? buildSpeakerResolutionInput(segments, request)
        : null;
      if (!input) {
        clear();
        return;
      }

      labels = carryLabelsToRenamedSegments(labels, labelsByKey, segments);
      const current = ++generation;
      const ids = new Set(segments.map((segment) => segment.id));
      commands.renderTranscriptSegments(input).then(
        (result) => {
          if (current !== generation) return;
          if (result.status === "error") {
            console.error(
              "[meeting-float] speaker resolution failed",
              result.error,
            );
            return;
          }
          labels = collectLabels(result.data, ids, numbering);
          labelsByKey = indexLabelsByKey(labels, segments);
          onChange();
        },
        (error) =>
          console.error("[meeting-float] speaker resolution failed", error),
      );
    },
    dispose: clear,
  };
}

function indexLabelsByKey(
  labels: ReadonlyMap<string, FloatingSpeakerLabel>,
  segments: ListenerState["liveSegments"],
): Map<string, FloatingSpeakerLabel> {
  const byKey = new Map<string, FloatingSpeakerLabel>();
  for (const segment of [...segments].sort((a, b) => a.start_ms - b.start_ms)) {
    const label = labels.get(segment.id);
    if (label) byKey.set(SegmentKeyUtils.serialize(segment.key), label);
  }
  return byKey;
}

function carryLabelsToRenamedSegments(
  labels: Map<string, FloatingSpeakerLabel>,
  labelsByKey: ReadonlyMap<string, FloatingSpeakerLabel>,
  segments: ListenerState["liveSegments"],
): Map<string, FloatingSpeakerLabel> {
  let next = labels;
  for (const segment of segments) {
    if (labels.has(segment.id)) continue;
    const label = labelsByKey.get(SegmentKeyUtils.serialize(segment.key));
    if (!label) continue;
    if (next === labels) next = new Map(labels);
    next.set(segment.id, label);
  }
  return next;
}

function collectLabels(
  rendered: RenderedTranscriptSegment[],
  liveIds: ReadonlySet<string>,
  numbering: SpeakerLabelManager,
): Map<string, FloatingSpeakerLabel> {
  const labels = new Map<string, FloatingSpeakerLabel>();
  for (const part of rendered) {
    // A context boundary splits a segment into `<id>:<start_ms>` parts; the
    // bubble shows the latest part's speaker.
    const id = liveIds.has(part.id)
      ? part.id
      : part.id.slice(0, part.id.lastIndexOf(":"));
    if (!liveIds.has(id)) continue;
    const anonymous = !part.key.speaker_human_id && !part.provisional_speaker;
    labels.set(id, {
      label: anonymous
        ? `Speaker ${numbering.getUnknownSpeakerNumber(part.key)}`
        : part.speaker_label,
      humanId:
        part.key.speaker_human_id ??
        part.provisional_speaker?.human_id ??
        undefined,
    });
  }
  return labels;
}
