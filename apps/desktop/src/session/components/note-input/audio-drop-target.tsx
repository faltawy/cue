import type { HTMLAttributes, ReactNode } from "react";

import { Waveform } from "@anlg/ui/components/icons";
import { floatingSurfaceClassName } from "@anlg/ui/components/ui/floating-content";
import { cn } from "@anlg/utils";

import { AUDIO_EXTENSIONS } from "~/stt/useUploadFile";

const supportedAudioFormats = formatAudioExtensionList(AUDIO_EXTENSIONS);

export function AudioDropTarget({
  children,
  className,
  isActive,
  targetProps,
}: {
  children: ReactNode;
  className?: string;
  isActive: boolean;
  targetProps: HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div {...targetProps} className={cn(["relative min-h-full", className])}>
      {isActive && (
        <div
          role="status"
          className={cn([
            "pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border border-dashed",
            "border-border bg-background text-muted-foreground",
          ])}
        >
          <div
            className={cn([
              floatingSurfaceClassName,
              "flex items-center gap-2.5 px-3 py-2.5",
            ])}
          >
            <Waveform className="text-muted-foreground size-4 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-ui font-medium">
                Drop to upload and transcribe audio
              </p>
              <p className="text-muted-foreground text-label">
                {supportedAudioFormats} audio
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function formatAudioExtensionList(extensions: string[]) {
  const labels = extensions.map((extension) => extension.toUpperCase());
  if (labels.length <= 1) {
    return labels.join("");
  }

  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}
