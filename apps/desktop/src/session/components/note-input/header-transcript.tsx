import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

import {
  CaretDown,
  CheckCircle,
  PencilSimple,
} from "@anlg/ui/components/icons";
import { DancingSticks } from "@anlg/ui/components/ui/dancing-sticks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { Spinner } from "@anlg/ui/components/ui/spinner";
import { toast } from "@anlg/ui/components/ui/toast";
import { cn } from "@anlg/utils";

import {
  IconHeaderView,
  copyTextToClipboard,
  iconHeaderViewClassName,
} from "./header-shared";
import { TranscriptAudioIcon } from "./header-transcript-icon";

import * as AudioPlayer from "~/audio-player";
import { useRegenerateTranscript } from "~/session/components/note-input/transcript/actions";
import {
  buildTranscriptExportSegments,
  formatTranscriptExportSegments,
} from "~/session/components/note-input/transcript/export-data";
import { getSessionTranscriptRenderRequest } from "~/session/components/note-input/transcript/render-request-hooks";
import { useHasTranscript } from "~/session/components/shared";
import { NoteHeaderSize } from "~/session/enums";
import {
  type MenuItemDef,
  useNativeContextMenu,
} from "~/shared/hooks/useNativeContextMenu";
import {
  BatchSessionMode,
  LiveSessionStatus,
} from "~/store/zustand/listener/enums";
import { useListener } from "~/stt/contexts";
import { ListenerControlAction } from "~/stt/enums";
import { useSessionTranscriptMetadata } from "~/stt/queries";
import { useStartListeningWithBatchOverride } from "~/stt/useStartListeningWithBatchOverride";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

export function HeaderViewTranscript({
  isActive,
  isTranscribing,
  editMode = false,
  onEditModeChange,
  onClick = () => {},
  sessionId,
}: {
  isActive: boolean;
  isTranscribing: boolean;
  editMode?: boolean;
  onEditModeChange?: (editMode: boolean) => void;
  onClick?: () => void;
  sessionId: string;
}) {
  const { t } = useLingui();
  const { live } = useTranscriptLiveViewState(sessionId);
  const icon = (
    <TranscriptTabIcon live={live} isTranscribing={isTranscribing} />
  );

  if (!isActive) {
    return (
      <IconHeaderView
        isActive={false}
        label={t`Transcript`}
        icon={icon}
        onClick={onClick}
        className={live ? "group/transcript-live" : undefined}
      />
    );
  }

  return (
    <HeaderViewTranscriptActive
      icon={icon}
      editMode={editMode}
      onEditModeChange={onEditModeChange}
      onClick={onClick}
      sessionId={sessionId}
    />
  );
}

function TranscriptTabIcon({
  live,
  isTranscribing,
}: {
  live?: { amplitude: number; muted: boolean };
  isTranscribing: boolean;
}) {
  if (live) return <HeaderViewTranscriptLiveIcon live={live} />;
  if (isTranscribing) return <Spinner size={16} className="shrink-0" />;
  return <TranscriptAudioIcon />;
}

function HeaderViewTranscriptLiveIcon({
  live,
}: {
  live: {
    amplitude: number;
    muted: boolean;
  };
}) {
  return (
    <span className="text-destructive relative flex size-4 items-center justify-center">
      {live.muted ? (
        <TranscriptAudioIcon />
      ) : (
        <DancingSticks
          amplitude={live.amplitude}
          color="currentColor"
          height={16}
          width={16}
        />
      )}
    </span>
  );
}

function useTranscriptLiveViewState(sessionId: string) {
  const { amplitude, muted } = useListener((state) => {
    const active = state.getSessionMode(sessionId) === LiveSessionStatus.Active;
    return {
      amplitude: active ? state.live.amplitude : null,
      muted: active && state.live.muted,
    };
  });
  return {
    live: amplitude
      ? {
          amplitude: Math.min(Math.hypot(amplitude.mic, amplitude.speaker), 1),
          muted,
        }
      : undefined,
  };
}

function HeaderViewTranscriptActive({
  icon,
  editMode,
  onEditModeChange,
  onClick,
  sessionId,
}: {
  icon: React.ReactNode;
  editMode: boolean;
  onEditModeChange?: (editMode: boolean) => void;
  onClick?: () => void;
  sessionId: string;
}) {
  const regenerate = useRegenerateTranscript(sessionId);
  const startListening = useStartListeningWithBatchOverride(sessionId);
  const hasTranscript = useHasTranscript(sessionId);
  const transcriptMetadata = useSessionTranscriptMetadata(sessionId);
  const {
    audioExists,
    audioExistsResolved,
    deleteRecording,
    isDeletingRecording,
  } = AudioPlayer.useAudioPlayer();
  const { t } = useLingui();
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const canEdit =
    sessionMode === LiveSessionStatus.Inactive &&
    hasTranscript &&
    Boolean(onEditModeChange);
  const handleToggleEdit = useCallback(() => {
    onEditModeChange?.(!editMode);
  }, [editMode, onEditModeChange]);
  const canCopyTranscript = transcriptMetadata.some(
    (metadata) => metadata.hasWords,
  );
  const handleCopyTranscript = useCallback(async () => {
    try {
      const transcriptExportRequest =
        await getSessionTranscriptRenderRequest(sessionId);
      if (!transcriptExportRequest) {
        return;
      }

      const transcriptSegments = await buildTranscriptExportSegments(
        transcriptExportRequest,
      );
      const transcriptText = formatTranscriptExportSegments(transcriptSegments);
      if (!transcriptText) {
        return;
      }

      await copyTextToClipboard(transcriptText, {
        success: "Transcript copied to clipboard",
        error: "Failed to copy transcript",
      });
    } catch (error) {
      console.error("Failed to copy transcript", error);
      toast.error("Failed to copy transcript");
    }
  }, [sessionId]);
  const handleDeleteRecording = useCallback(() => {
    void deleteRecording();
  }, [deleteRecording]);
  const handleResumeListening = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl(ListenerControlAction.Start, sessionId);
      return;
    }

    void startListening();
  }, [sessionId, startListening]);
  const contextMenu = useMemo<MenuItemDef[]>(() => {
    const items: MenuItemDef[] = [
      {
        id: `copy-transcript-${sessionId}`,
        text: t`Copy`,
        action: () => {
          void handleCopyTranscript();
        },
        disabled: !canCopyTranscript,
      },
    ];

    if (
      sessionMode === LiveSessionStatus.Inactive ||
      sessionMode === BatchSessionMode.RunningBatch
    ) {
      items.push({
        id: `resume-listening-${sessionId}`,
        text: t`Resume listening`,
        action: handleResumeListening,
      });
    }

    if (
      audioExistsResolved &&
      sessionMode === LiveSessionStatus.Inactive &&
      audioExists
    ) {
      items.push({
        id: `regenerate-transcript-${sessionId}`,
        text: t`Re-transcribe`,
        action: () => {
          void regenerate();
        },
      });
    }

    if (audioExists) {
      items.push({
        id: `delete-recording-${sessionId}`,
        text: t`Delete recording`,
        action: handleDeleteRecording,
        disabled: isDeletingRecording,
      });
    }

    return items;
  }, [
    audioExists,
    audioExistsResolved,
    canCopyTranscript,
    handleCopyTranscript,
    handleDeleteRecording,
    handleResumeListening,
    isDeletingRecording,
    regenerate,
    sessionMode,
    sessionId,
    t,
  ]);
  const showContextMenu = useNativeContextMenu(contextMenu);

  // Like the summary tab, the selected tab opens its actions from a caret;
  // the edit toggle lives in that menu rather than as an icon in the label.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-main-area-window-drag-region
          data-tauri-drag-region="false"
          type="button"
          aria-label={t`Transcript`}
          aria-current="page"
          onClick={onClick}
          onContextMenu={showContextMenu}
          className={iconHeaderViewClassName(
            true,
            NoteHeaderSize.Tray,
            cn([
              "max-w-40 min-w-10 cursor-pointer gap-1.5 px-2 @max-[480px]:max-w-12 @max-[480px]:min-w-12 @max-[480px]:gap-0 @max-[480px]:px-1.5",
              "focus-visible:bg-muted focus-visible:text-foreground",
            ]),
          )}
        >
          {icon}
          <span className="text-label min-w-0 truncate font-medium @max-[480px]:sr-only">
            {editMode ? t`Editing` : t`Transcript`}
          </span>
          <CaretDown aria-hidden className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {canEdit ? (
          <>
            <DropdownMenuItem onClick={handleToggleEdit}>
              {editMode ? <CheckCircle /> : <PencilSimple />}
              <span>{editMode ? t`Done editing` : t`Edit transcript`}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {contextMenu.map((item) =>
          "separator" in item ? null : (
            <DropdownMenuItem
              key={item.id}
              destructive={item.id.startsWith("delete-recording")}
              disabled={item.disabled}
              onClick={() => void item.action?.()}
            >
              <span>{item.text}</span>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
