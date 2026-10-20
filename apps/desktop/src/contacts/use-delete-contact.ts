import { t } from "@lingui/core/macro";
import { useCallback } from "react";

import { toast } from "@anlg/ui/components/ui/toast";

import { deleteContact, restoreContact } from "./queries";

import { useTabs } from "~/store/zustand/tabs";
import { UNDO_TIMEOUT_MS } from "~/store/zustand/undo-delete";

export function useDeleteContact() {
  const invalidateResource = useTabs((state) => state.invalidateResource);

  return useCallback(
    (type: "human" | "organization", contactId: string, name: string) => {
      invalidateResource(
        type === "human" ? "humans" : "organizations",
        contactId,
      );

      void deleteContact(type, contactId)
        .then((tombstone) => {
          if (!tombstone) return;
          const label = name.trim()
            ? t`${name.trim()} deleted`
            : t`Contact deleted`;
          toast.message(label, {
            id: `undo-delete-contact:${contactId}`,
            duration: UNDO_TIMEOUT_MS,
            action: {
              label: t`Undo`,
              onClick: () => {
                void restoreContact(type, contactId, tombstone).catch(
                  (error) => {
                    console.error("[contacts] failed to restore contact", {
                      contactId,
                      error,
                    });
                    toast.error(t`Could not restore the contact`);
                  },
                );
              },
            },
          });
        })
        .catch((error) => {
          console.error("[contacts] failed to delete contact", {
            contactId,
            error,
          });
          toast.error(t`Could not delete this contact. Please try again.`);
        });
    },
    [invalidateResource],
  );
}
