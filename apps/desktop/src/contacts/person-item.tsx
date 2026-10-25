import React, { useCallback } from "react";

import { IconWeight, PushPin } from "@anlg/ui/components/icons";
import { ROW_HOVER, ROW_SELECTED } from "@anlg/ui/components/ui/row";
import { cn } from "@anlg/utils";

import { ContactImage } from "~/contacts/contact-avatar";
import { ContactType } from "~/contacts/enums";
import { type HumanRecord, toggleContactPin } from "~/contacts/queries";
import { ContactFacehash } from "~/contacts/shared";
import { useNativeContextMenu } from "~/shared/hooks/useNativeContextMenu";

export function PersonItem({
  person,
  active,
  onClick,
  onDelete,
  readOnly = false,
}: {
  readOnly?: boolean;
  person: HumanRecord;
  active: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}) {
  const isPinned = readOnly || Boolean(person.pinned);
  const personName = person.name;
  const personEmail = person.email;
  const facehashName = personName || personEmail || person.id;

  const togglePin = useCallback(() => {
    void toggleContactPin(ContactType.Human, person.id).catch((error) => {
      console.error("[contacts] failed to toggle contact pin", error);
    });
  }, [person.id]);

  const showContextMenu = useNativeContextMenu([
    {
      id: "toggle-pin-person",
      text: isPinned ? "Unpin Contact" : "Pin Contact",
      action: togglePin,
    },
    {
      id: "delete-person",
      text: "Delete Contact",
      action: () => onDelete?.(person.id),
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
      onContextMenu={readOnly ? undefined : showContextMenu}
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
      {person.avatarDataUrl ? (
        <ContactImage src={person.avatarDataUrl} size={32} />
      ) : (
        <ContactFacehash name={facehashName} size={32} />
      )}
      <div className="min-w-0 flex-1">
        <div
          title={personName || personEmail}
          className="w-fit max-w-full truncate font-medium [unicode-bidi:plaintext]"
        >
          {personName || personEmail || "Unnamed"}
        </div>
        {personEmail && personName && (
          <div
            title={personEmail}
            className="text-muted-foreground text-label truncate"
          >
            {personEmail}
          </div>
        )}
      </div>
      {readOnly ? (
        <span
          role="img"
          aria-label="Pinned contact"
          className="text-warm shrink-0 p-1"
        >
          <PushPin className="size-3.5" weight={IconWeight.Bold} />
        </span>
      ) : (
        <button
          onClick={handleTogglePin}
          className={cn([
            "shrink-0 rounded-sm p-1 transition-colors",
            isPinned
              ? "text-warm hover:text-warm/80"
              : "text-muted-foreground/70 hover:text-muted-foreground opacity-0 group-hover:opacity-100",
          ])}
          aria-label={isPinned ? "Unpin contact" : "Pin contact"}
        >
          <PushPin
            className="size-3.5"
            weight={isPinned ? IconWeight.Bold : IconWeight.Regular}
          />
        </button>
      )}
    </div>
  );
}
