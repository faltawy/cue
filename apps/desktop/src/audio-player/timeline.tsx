import { useCallback, useMemo, useState } from "react";

import { Pause, Play } from "@anlg/ui/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { cn } from "@anlg/utils";

import { useAudioPlayer, useAudioTime } from "./provider";
import { TimelineMeta, TimelineShell } from "./timeline-shell";

import { AudioPlayerState } from "~/audio-player/enums";
import { useNativeContextMenu } from "~/shared/hooks/useNativeContextMenu";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function Timeline({
  contentClassName,
}: {
  contentClassName?: string;
} = {}) {
  const {
    registerContainer,
    state,
    pause,
    resume,
    start,
    stop,
    playbackRate,
    setPlaybackRate,
    deleteRecording,
    isDeletingRecording,
  } = useAudioPlayer();
  const time = useAudioTime();
  const [showRateMenu, setShowRateMenu] = useState(false);

  const handleClick = () => {
    if (state === AudioPlayerState.Playing) {
      pause();
    } else if (state === AudioPlayerState.Paused) {
      resume();
    } else if (state === AudioPlayerState.Stopped) {
      start();
    }
  };

  const handleDeleteRecording = useCallback(async () => {
    setShowRateMenu(false);
    await deleteRecording();
  }, [deleteRecording]);

  const contextMenu = useMemo(
    () => [
      ...(state === AudioPlayerState.Paused
        ? [{ id: "resume", text: "Resume", action: resume }]
        : []),
      ...(state === AudioPlayerState.Stopped
        ? [{ id: "play", text: "Play", action: start }]
        : []),
      ...(state === AudioPlayerState.Playing
        ? [{ id: "pause", text: "Pause", action: pause }]
        : []),
      ...(state !== AudioPlayerState.Stopped
        ? [{ id: "stop", text: "Stop", action: stop }]
        : []),
      { separator: true as const },
      {
        id: "delete-recording",
        text: "Delete recording",
        action: () => void handleDeleteRecording(),
        disabled: isDeletingRecording,
      },
    ],
    [
      state,
      resume,
      start,
      pause,
      stop,
      isDeletingRecording,
      handleDeleteRecording,
    ],
  );
  const showContextMenu = useNativeContextMenu(contextMenu);

  return (
    <TimelineShell
      contentClassName={contentClassName}
      onContextMenu={showContextMenu}
      leading={
        <button
          onClick={handleClick}
          className={cn([
            "flex items-center justify-center",
            "size-7 rounded-full",
            "bg-primary text-primary-foreground",
            "transition-opacity duration-100 hover:opacity-90 active:opacity-80",
            "shrink-0 select-none",
          ])}
        >
          {state === AudioPlayerState.Playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
      }
      meta={
        <>
          <TimelineMeta>
            <span>{formatTime(time.current)}</span>/
            <span>{formatTime(time.total)}</span>
          </TimelineMeta>

          <DropdownMenu
            modal={false}
            open={showRateMenu}
            onOpenChange={setShowRateMenu}
          >
            <DropdownMenuTrigger asChild>
              <button
                className={cn([
                  "flex shrink-0 items-center justify-center",
                  "h-6 rounded-md px-1.5",
                  "hover:bg-muted hover:text-foreground transition-colors duration-100",
                  "text-muted-foreground text-label tabular-nums select-none",
                ])}
              >
                {playbackRate}x
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              className="border-border bg-card min-w-0 rounded-lg p-0 py-1"
            >
              {PLAYBACK_RATES.map((rate) => (
                <DropdownMenuItem
                  key={rate}
                  onSelect={() => setPlaybackRate(rate)}
                  className={cn([
                    "text-label block w-full rounded-none px-3 py-1 text-start tabular-nums select-none",
                    "hover:bg-accent focus:bg-accent transition-colors",
                    rate === playbackRate
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground",
                  ])}
                >
                  {rate}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      main={
        <div
          ref={registerContainer}
          className="h-6 min-w-0 flex-1"
          style={{ width: "100%" }}
        />
      }
    />
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
