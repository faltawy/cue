import { useState, type CSSProperties } from "react";

import { avatarInitials, avatarTint } from "@anlg/ui/lib/avatar";
import { cn } from "@anlg/utils";

export type AvatarProps = Readonly<{
  seed: string;
  label?: string;
  size?: number;
  imageUrl?: string | null;
  className?: string;
}>;

// cue.md §4: flat, one muted tint per person from the speaker palette, with
// the initials in that hue. A photo replaces both.
export function Avatar({
  seed,
  label = seed,
  size = 40,
  imageUrl,
  className,
}: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const dimension = Math.max(1, size);
  const photo = imageUrl && imageUrl !== failedUrl ? imageUrl : null;
  const tint = `var(--speaker-${avatarTint(seed)})`;
  const style = {
    width: dimension,
    height: dimension,
    fontSize: Math.max(7, Math.round(dimension * 0.4)),
    color: tint,
    backgroundColor: photo
      ? undefined
      : `color-mix(in oklch, ${tint} 14%, var(--background))`,
  } satisfies CSSProperties;

  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn([
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full leading-none font-medium select-none",
        className,
      ])}
    >
      {photo ? (
        <img
          alt=""
          draggable={false}
          src={photo}
          onError={() => setFailedUrl(photo)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        avatarInitials(label)
      )}
    </span>
  );
}
