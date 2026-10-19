import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { Input } from "@anlg/ui/components/ui/input";

import { normalizeFolderPath } from "~/session/folders";

export function FolderNameDialog({
  open,
  title,
  confirmLabel,
  initialValue = "",
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialValue?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (folderPath: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [syncedSource, setSyncedSource] = useState({ open, initialValue });
  if (
    syncedSource.open !== open ||
    syncedSource.initialValue !== initialValue
  ) {
    setSyncedSource({ open, initialValue });
    if (open) {
      setValue(initialValue);
      setError(null);
      setBusy(false);
    }
  }

  const submit = async () => {
    const normalized = normalizeFolderPath(value.trim());
    if (!normalized || normalized.includes("/")) {
      setError(t`Enter a valid folder name.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(normalized);
      onOpenChange(false);
    } catch (cause) {
      setError(
        String(cause instanceof Error ? cause.message : cause).includes(
          "folder_target_exists",
        )
          ? t`A folder with this name already exists.`
          : t`Could not save the folder.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>Folder name</Trans>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={value}
            disabled={busy}
            aria-label={t`Folder name`}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
          {error ? (
            <p className="text-destructive text-label pt-2">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
