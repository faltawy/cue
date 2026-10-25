import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { downloadDir, join } from "@tauri-apps/api/path";
import { useMemo, useState } from "react";

import { json2md } from "@anlg/editor/markdown";
import {
  commands as exportCommands,
  type ExportMetadata,
  type TranscriptItem,
} from "@anlg/plugin-export";
import { commands as fs2Commands } from "@anlg/plugin-fs2";
import { commands as openerCommands } from "@anlg/plugin-opener2";
import { Button } from "@anlg/ui/components/ui/button";
import { Checkbox } from "@anlg/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { Radio } from "@anlg/ui/components/ui/radio";
import { SessionNoteViewType } from "@anlg/utils/session";

import { formatDate, formatDuration } from "./export-utils";

import { useTranscriptExportSegments } from "~/session/components/note-input/transcript/export-data";
import { FileFormat } from "~/session/enums";
import {
  useEnhancedNote,
  useSession,
  useSessionParticipants,
} from "~/session/queries";
import { getSessionEvent } from "~/session/utils";
import { getStoredSettingValues } from "~/settings/queries";
import type { EditorView } from "~/store/zustand/tabs/schema";
import { useSessionTranscriptMetadata } from "~/stt/queries";

function markdownToText(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownToOrg(content: string): string {
  return content
    .replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => {
      return `${"*".repeat(hashes.length)} `;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2][$1]]")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .replace(/__(.*?)__/g, "*$1*")
    .replace(/`([^`]+)`/g, "~$1~")
    .trim();
}

export function ExportModal({
  sessionId,
  currentView,
  open,
  onOpenChange,
}: {
  sessionId: string;
  currentView: EditorView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const [format, setFormat] = useState<FileFormat>(FileFormat.Pdf);
  const [includeMemo, setIncludeMemo] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTranscript, setIncludeTranscript] = useState(false);

  const session = useSession(sessionId);
  const sessionTitle = session?.title;
  const sessionCreatedAt = session?.created_at;
  const event = session ? getSessionEvent(session) : null;
  const eventTitle = event?.title;
  const rawMd = session?.raw_md;

  const enhancedNoteId =
    currentView.type === SessionNoteViewType.Enhanced ? currentView.id : "";
  const summaryContent = useEnhancedNote(enhancedNoteId)?.content;
  const participants = useSessionParticipants(sessionId);

  const participantNames = useMemo(
    () => participants.map((participant) => participant.name).filter(Boolean),
    [participants],
  );

  const { data: transcriptItems, isLoading: isTranscriptLoading } =
    useTranscriptExportSegments(sessionId);

  const transcripts = useSessionTranscriptMetadata(sessionId);

  const transcriptDuration = useMemo((): string | null => {
    if (transcripts.length === 0) {
      return null;
    }

    let minStartedAt: number | null = null;
    let maxEndedAt: number | null = null;

    for (const transcript of transcripts) {
      if (minStartedAt === null || transcript.startedAt < minStartedAt) {
        minStartedAt = transcript.startedAt;
      }
      if (transcript.endedAt !== undefined) {
        if (maxEndedAt === null || transcript.endedAt > maxEndedAt) {
          maxEndedAt = transcript.endedAt;
        }
      }
    }

    if (minStartedAt !== null && maxEndedAt !== null) {
      return formatDuration(minStartedAt, maxEndedAt);
    }
    return null;
  }, [transcripts]);

  const getMemoMd = (): string => {
    if (!rawMd) return "";
    try {
      const parsed = JSON.parse(rawMd);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const getSummaryMd = (): string => {
    if (!summaryContent) return "";
    try {
      const parsed = JSON.parse(summaryContent);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const getTranscriptText = (): string => {
    if (transcriptItems.length === 0) return "";
    return transcriptItems
      .map((item) => {
        const speaker = item.speaker ? `${item.speaker}: ` : "";
        return `${speaker}${item.text}`;
      })
      .join("\n\n");
  };

  const buildMdContent = (): string => {
    const sections: string[] = [];
    const title = sessionTitle || t`Untitled`;
    sections.push(`# ${title}`);

    if (sessionCreatedAt) {
      sections.push(`- ${t`Created`}: ${formatDate(sessionCreatedAt)}`);
    }

    if (participantNames.length > 0) {
      sections.push(`- ${t`Participants`}: ${participantNames.join(", ")}`);
    }

    if (transcriptDuration) {
      sections.push(`- ${t`Duration`}: ${transcriptDuration}`);
    }

    if (includeMemo) {
      const memo = getMemoMd();
      if (memo) {
        sections.push("");
        sections.push(`## ${t`Memo`}`);
        sections.push(memo);
      }
    }

    if (includeSummary) {
      const summary = getSummaryMd();
      if (summary) {
        sections.push("");
        sections.push(`## ${t`Summary`}`);
        sections.push(summary);
      }
    }

    if (includeTranscript) {
      const transcript = getTranscriptText();
      if (transcript) {
        sections.push("");
        sections.push(`## ${t`Transcript`}`);
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildTxtContent = (): string => {
    const sections: string[] = [];
    const title = sessionTitle || t`Untitled`;
    sections.push(title);
    sections.push("=".repeat(title.length));

    if (sessionCreatedAt) {
      sections.push(formatDate(sessionCreatedAt));
    }

    if (participantNames.length > 0) {
      sections.push(`${t`Participants`}: ${participantNames.join(", ")}`);
    }

    if (transcriptDuration) {
      sections.push(`${t`Duration`}: ${transcriptDuration}`);
    }

    if (includeMemo) {
      const memo = getMemoMd();
      if (memo) {
        sections.push("");
        sections.push(t`Memo`);
        sections.push("-".repeat(4));
        sections.push(markdownToText(memo));
      }
    }

    if (includeSummary) {
      const summary = getSummaryMd();
      if (summary) {
        sections.push("");
        sections.push(t`Summary`);
        sections.push("-".repeat(7));
        sections.push(markdownToText(summary));
      }
    }

    if (includeTranscript) {
      const transcript = getTranscriptText();
      if (transcript) {
        sections.push("");
        sections.push(t`Transcript`);
        sections.push("-".repeat(10));
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildOrgContent = (): string => {
    const sections: string[] = [];
    const title = sessionTitle || t`Untitled`;
    sections.push(`#+TITLE: ${title}`);

    if (sessionCreatedAt) {
      sections.push(`#+DATE: ${formatDate(sessionCreatedAt)}`);
    }

    sections.push("");
    sections.push(`* ${t`Metadata`}`);

    if (sessionCreatedAt) {
      sections.push(`- ${t`Created`} :: ${formatDate(sessionCreatedAt)}`);
    }

    if (participantNames.length > 0) {
      sections.push(`- ${t`Participants`} :: ${participantNames.join(", ")}`);
    }

    if (transcriptDuration) {
      sections.push(`- ${t`Duration`} :: ${transcriptDuration}`);
    }

    if (includeMemo) {
      const memo = getMemoMd();
      if (memo) {
        sections.push("");
        sections.push(`* ${t`Memo`}`);
        sections.push(markdownToOrg(memo));
      }
    }

    if (includeSummary) {
      const summary = getSummaryMd();
      if (summary) {
        sections.push("");
        sections.push(`* ${t`Summary`}`);
        sections.push(markdownToOrg(summary));
      }
    }

    if (includeTranscript) {
      const transcript = getTranscriptText();
      if (transcript) {
        sections.push("");
        sections.push(`* ${t`Transcript`}`);
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildPdfContent = (): {
    enhancedMd: string;
    memoMd: string | null;
    transcript: { items: TranscriptItem[] } | null;
    metadata: ExportMetadata | null;
  } => {
    const metadata: ExportMetadata = {
      title: sessionTitle || t`Untitled`,
      createdAt: sessionCreatedAt ? formatDate(sessionCreatedAt) : "",
      participants: participantNames,
      eventTitle: eventTitle || null,
      duration: transcriptDuration,
    };

    let memoMd: string | null = null;
    if (includeMemo) {
      const memo = getMemoMd();
      if (memo) memoMd = memo;
    }

    const parts: string[] = [];

    if (includeSummary) {
      const summary = getSummaryMd();
      if (summary) parts.push(summary);
    }

    return {
      enhancedMd: parts.join("\n\n"),
      memoMd,
      transcript:
        includeTranscript && transcriptItems.length > 0
          ? { items: transcriptItems }
          : null,
      metadata,
    };
  };

  const { mutate, isPending, error } = useMutation({
    mutationFn: async () => {
      const { values } = await getStoredSettingValues();
      const directory = values.export_directory || (await downloadDir());
      const sanitizedTitle = (
        (sessionTitle ?? t`Untitled`).trim() || t`Untitled`
      ).replace(/[<>:"/\\|?*]/g, "_");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${sanitizedTitle}_${timestamp}.${format}`;
      const path = await join(directory, filename);

      if (format === FileFormat.Pdf) {
        const exportContent = buildPdfContent();
        const result = await exportCommands.export(path, exportContent);
        if (result.status === "error") {
          throw new Error(result.error);
        }
      } else {
        const textContent =
          format === FileFormat.Md
            ? buildMdContent()
            : format === FileFormat.Org
              ? buildOrgContent()
              : buildTxtContent();
        const result = await fs2Commands.writeTextFile(path, textContent);
        if (result.status === "error") {
          throw new Error(result.error);
        }
      }

      return path;
    },
    onSuccess: (path) => {
      void openerCommands.revealItemInDir(path);
      onOpenChange(false);
    },
    onError: console.error,
  });

  const hasAnyContentSelected =
    includeMemo || includeSummary || includeTranscript;
  const isTranscriptPending = includeTranscript && isTranscriptLoading;
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>
            <Trans>Export</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Choose a file format and what to include.</Trans>
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-label text-muted-foreground pb-1.5 font-medium">
            <Trans>File format</Trans>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.values(FileFormat).map((f) => (
              <label
                key={f}
                className="text-ui flex cursor-pointer items-center gap-1.5"
              >
                <Radio
                  name="export-format"
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f === FileFormat.Md
                  ? "Markdown"
                  : f === FileFormat.Org
                    ? "Org"
                    : f.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-label text-muted-foreground pb-1.5 font-medium">
            <Trans>Include</Trans>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(
              [
                ["memo", <Trans>Memo</Trans>, includeMemo, setIncludeMemo],
                [
                  "summary",
                  <Trans>Summary</Trans>,
                  includeSummary,
                  setIncludeSummary,
                ],
                [
                  "transcript",
                  <Trans>Transcript</Trans>,
                  includeTranscript,
                  setIncludeTranscript,
                ],
              ] as const
            ).map(([id, label, checked, setter]) => (
              <label
                key={id}
                className="text-ui flex cursor-pointer items-center gap-1.5"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => setter(next === true)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-destructive text-label">
            <Trans>
              Could not export. Check the export location in Settings and try
              again.
            </Trans>
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={() => mutate(null)}
            disabled={
              isPending || isTranscriptPending || !hasAnyContentSelected
            }
          >
            {isPending
              ? t`Exporting...`
              : isTranscriptPending
                ? t`Preparing transcript...`
                : t`Export`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
