import React, { useCallback } from "react";

import { IconWeight, Buildings, PushPin } from "@anlg/ui/components/icons";
import { ROW_HOVER, ROW_SELECTED } from "@anlg/ui/components/ui/row";
import { cn } from "@anlg/utils";

import { ContactImage } from "~/contacts/contact-avatar";
import { ContactType } from "~/contacts/enums";
import { type OrganizationRecord, toggleContactPin } from "~/contacts/queries";
import { useNativeContextMenu } from "~/shared/hooks/useNativeContextMenu";

export function OrganizationItem({
  organization,
  active,
  onClick,
  onDelete,
}: {
  organization: OrganizationRecord;
  active: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}) {
  const isPinned = Boolean(organization.pinned);

  const togglePin = useCallback(() => {
    void toggleContactPin(ContactType.Organization, organization.id).catch(
      (error) => {
        console.error("[contacts] failed to toggle organization pin", error);
      },
    );
  }, [organization.id]);

  const showContextMenu = useNativeContextMenu([
    {
      id: "toggle-pin-org",
      text: isPinned ? "Unpin Organization" : "Pin Organization",
      action: togglePin,
    },
    {
      id: "delete-org",
      text: "Delete Organization",
      action: () => onDelete?.(organization.id),
    },
  ]);

  const handleTogglePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      togglePin();
    },
    [togglePin],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={showContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn([
        "group text-ui flex w-full items-center gap-2 overflow-hidden rounded-md px-2.5 py-1.5 text-start transition-colors duration-100 select-none",
        active ? ROW_SELECTED : ROW_HOVER,
      ])}
    >
      {organization.avatarDataUrl ? (
        <ContactImage src={organization.avatarDataUrl} size={32} />
      ) : (
        <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <Buildings className="text-muted-foreground h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          title={organization.name}
          className="w-fit max-w-full truncate font-medium [unicode-bidi:plaintext]"
        >
          {organization.name}
        </div>
      </div>
      <button
        onClick={handleTogglePin}
        className={cn([
          "shrink-0 rounded-sm p-1 transition-colors",
          isPinned
            ? "text-warm hover:text-warm/80"
            : "text-muted-foreground/70 hover:text-muted-foreground opacity-0 group-hover:opacity-100",
        ])}
        aria-label={isPinned ? "Unpin organization" : "Pin organization"}
      >
        <PushPin
          className="size-3.5"
          weight={isPinned ? IconWeight.Bold : IconWeight.Regular}
        />
      </button>
    </div>
  );
}
