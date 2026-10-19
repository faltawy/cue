import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@anlg/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { cn, formatDistanceToNow, safeParseDate } from "@anlg/utils";

import {
  previewFromBody,
  restoreSessionDocumentBody,
  useSessionConflicts,
  useSessionDocumentVersions,
} from "~/session/queries";

export function VersionHistoryDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const conflicts = useSessionConflicts(sessionId);
  const versions = useSessionDocumentVersions(sessionId);

  const restoreMutation = useMutation({
    mutationFn: (entry: { body: string; bodyFormat: string }) =>
      restoreSessionDocumentBody({ sessionId, ...entry }),
    onSuccess: () => onOpenChange(false),
  });

  const entries = [
    ...conflicts
      .filter((conflict) => conflict.field === "body")
      .map((conflict) => ({
        id: conflict.id,
        label: t`Other device's version`,
        at:
          conflict.editedAtMs ??
          safeParseDate(conflict.createdAt)?.getTime() ??
          0,
        body: conflict.value,
        bodyFormat: conflict.bodyFormat,
      })),
    ...versions.map((version) => ({
      id: version.id,
      label: version.source === "sync" ? t`Synced` : t`This device`,
      at: safeParseDate(version.createdAt)?.getTime() ?? 0,
      body: version.body,
      bodyFormat: version.bodyFormat,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(560px,calc(100vh-80px))] w-full max-w-lg flex-col gap-4 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>
            <Trans>Version history</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Earlier versions of this note, newest first.</Trans>
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-ui py-6 text-center">
            <Trans>No earlier versions yet.</Trans>
          </p>
        ) : (
          <ol className="divide-border scrollbar-soft min-h-0 flex-1 divide-y overflow-y-auto">
            {entries.map((entry) => {
              const preview = previewFromBody(entry.body, entry.bodyFormat);
              return (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-ui font-medium">{entry.label}</p>
                    <p className="text-muted-foreground text-caption mt-0.5 tabular-nums">
                      {entry.at > 0
                        ? formatDistanceToNow(new Date(entry.at), {
                            addSuffix: true,
                          })
                        : null}
                    </p>
                    <p
                      className={cn([
                        "text-muted-foreground text-label mt-1",
                        "line-clamp-3 break-words",
                      ])}
                    >
                      {preview || <Trans>Empty note</Trans>}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restoreMutation.isPending}
                    onClick={() =>
                      restoreMutation.mutate({
                        body: entry.body,
                        bodyFormat: entry.bodyFormat,
                      })
                    }
                  >
                    <Trans>Restore</Trans>
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        {restoreMutation.error && (
          <p className="text-label text-destructive">
            {restoreMutation.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
