// Answers for the non-SQL Tauri commands the screens call. Keyed by the
// full command name; a function receives the invoke arguments.
const seen = new Set<string>();

type Word = { id: string; text: string; start_ms: number; end_ms: number; channel: number };
type Assignment = { human_id: string; scope: { kind: string; word_ids?: string[] } };
type RenderRequest = {
  transcripts: { words: Word[]; assignments: Assignment[] }[];
  humans: { human_id: string; name: string }[];
};

const CHANNELS = ["DirectMic", "RemoteParty", "MixedCapture"];

// Stands in for the native segmenter: consecutive words of one speaker form a
// segment, and an assignment carries over until the next one.
function renderTranscript({ params: request }: { params: RenderRequest }) {
  const names = new Map(request.humans.map((h) => [h.human_id, h.name]));
  const segments: Record<string, unknown>[] = [];
  for (const transcript of request.transcripts) {
    const byWord = new Map<string, string>();
    for (const assignment of transcript.assignments)
      for (const id of assignment.scope.word_ids ?? [])
        byWord.set(id, assignment.human_id);
    let human = "";
    let current: { words: Record<string, unknown>[]; human: string; channel: string } | null = null;
    for (const word of transcript.words) {
      human = byWord.get(word.id) ?? human;
      const channel = CHANNELS[word.channel] ?? "MixedCapture";
      if (!current || current.human !== human) {
        current = { words: [], human, channel };
        segments.push({
          id: `segment-${segments.length}`,
          key: { channel, speaker_index: null, speaker_human_id: human || null },
          speaker_label: names.get(human) ?? "Speaker",
          words: current.words,
        });
      }
      current.words.push({ ...word, channel, is_final: true });
    }
  }
  return segments.map((segment) => {
    const words = segment.words as Word[];
    return {
      ...segment,
      start_ms: words[0]?.start_ms ?? 0,
      end_ms: words.at(-1)?.end_ms ?? 0,
      text: words.map((w) => w.text).join("").trim(),
    };
  });
}

const FIXTURES: Record<string, unknown> = {
  "plugin:app|identifier": "com.cue.dev",
  "plugin:app|version": "0.1.0",
  "plugin:app|name": "Cue Dev",
  "plugin:window|theme": "light",
  "plugin:window|is_fullscreen": false,
  "plugin:transcription|list_capture_recoveries": [],
  "plugin:transcription|list_transcription_sessions": [],
  "plugin:transcription|get_capture_audio_cleanup_status": {},
  "plugin:detect|get_preferred_languages": ["en"],
  "plugin:calendar|list_connection_ids": [],
  "plugin:window|is_always_on_top": false,
  "plugin:windows|floating_bar_displays": [],
  "plugin:fs-sync|attachment_list": [],
  "plugin:fs-sync|audio_exist": false,
  "plugin:permissions|check_permission": "authorized",
  "plugin:path|resolve_directory": "/Users/demo/Downloads",
  "plugin:db|get_legacy_cleanup_status": {
    migrationReady: true,
    migrationVerified: true,
    available: true,
    alreadyCleaned: false,
    fileCount: 1284,
    totalBytes: 734_003_200,
    sourceRoot: "/Users/demo/Library/Application Support/com.anarlog.app",
    blockingReason: null,
  },
  "plugin:transcription|render_transcript_segments": renderTranscript,
  "plugin:misc|get_device_info": { os: "macos", arch: "aarch64" },
  "plugin:template|get_template_source": "",
  "plugin:misc|get_git_hash": "f5493f6c69533ba4",
  "plugin:local-auth|available": true,
  "plugin:local-auth|authenticate": false,
  get_dismissed_toasts: [],
  show_devtool: false,
};

export function fixture(cmd: string, args: Record<string, unknown>): unknown {
  if (cmd in FIXTURES) {
    const value = FIXTURES[cmd];
    return typeof value === "function" ? value(args) : value;
  }
  // Lists default to empty rather than null, which the callers iterate.
  if (cmd.includes("|list_") || cmd.startsWith("list_")) return [];
  if (!seen.has(cmd)) {
    seen.add(cmd);
    console.info(`[screens] unhandled ${cmd} ${JSON.stringify(args).slice(0, 160)}`);
  }
  return null;
}
