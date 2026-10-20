import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { DestructiveConfirmationDialog } from "~/shared/ui/destructive-confirmation-dialog";

export function useConfirmTemplateDelete(
  templates: readonly { id: string; title: string }[],
  onConfirm: (id: string) => Promise<void>,
) {
  const { t } = useLingui();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const title =
    templates.find((template) => template.id === pendingId)?.title.trim() ||
    t`Untitled`;

  const dialog = (
    <DestructiveConfirmationDialog
      open={pendingId !== null}
      onOpenChange={(open) => {
        if (!open) setPendingId(null);
      }}
      title={t`Delete “${title}”?`}
      description={t`The template is removed for good. Notes already written with it keep their content.`}
      confirmLabel={t`Delete`}
      onConfirm={() => {
        const id = pendingId;
        setPendingId(null);
        if (id) void onConfirm(id);
      }}
    />
  );

  return { requestDelete: setPendingId, dialog };
}
