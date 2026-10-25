import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode } from "react";

import {
  IconWeight,
  DotsThree,
  MinusCircle,
  PushPin,
  Trash,
} from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";

export function ContactPageHeader({
  readOnly = false,
  title,
  compactIdentity,
  showCompactIdentity,
  pinned,
  onTogglePin,
  onDelete,
  onRemoveAvatar,
}: {
  readOnly?: boolean;
  title: string;
  compactIdentity: ReactNode;
  showCompactIdentity: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
  onRemoveAvatar?: () => void;
}) {
  const { t } = useLingui();

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center justify-between gap-3 ps-3 pe-1"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showCompactIdentity && compactIdentity}
        <h2 className="text-body min-w-0 truncate font-semibold">{title}</h2>
      </div>
      {!readOnly && (
        <div
          data-tauri-drag-region="false"
          className="flex shrink-0 items-center gap-1"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-tauri-drag-region="false"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t`Contact options`}
              >
                <DotsThree size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={onTogglePin}
                className="cursor-pointer"
              >
                <PushPin
                  weight={pinned ? IconWeight.Bold : IconWeight.Regular}
                />
                <span>
                  {pinned ? <Trans>Unpin</Trans> : <Trans>Pin</Trans>}
                </span>
              </DropdownMenuItem>
              {onRemoveAvatar && (
                <DropdownMenuItem
                  onClick={onRemoveAvatar}
                  className="cursor-pointer"
                >
                  <MinusCircle />
                  <span>
                    <Trans>Remove photo</Trans>
                  </span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={onDelete}>
                <Trash />
                <span>
                  <Trans>Delete</Trans>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
