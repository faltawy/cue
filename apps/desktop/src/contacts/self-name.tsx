import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Input } from "@anlg/ui/components/ui/input";

import { updateHuman, usePersonalContact } from "~/contacts/queries";
import { setSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import { useOwnerUserId } from "~/shared/owner-user";
import { commands } from "~/types/tauri.gen";

// The local user's row appears with the first session and starts without a name. Name it once
// from the macOS account; a name the user already has, or later clears, is never replaced.
export function SelfNameBackfill() {
  const done = useConfigValue("self_name_backfilled");
  const ownerUserId = useOwnerUserId();
  const { data: self } = usePersonalContact(ownerUserId ?? "");
  const running = useRef(false);

  useEffect(() => {
    if (done || running.current || !ownerUserId || !self) return;
    running.current = true;
    void (async () => {
      if (!self.name.trim()) {
        const name = (await commands.accountFullName())?.trim();
        if (name) await updateHuman(ownerUserId, { name });
      }
      await setSettingValue("self_name_backfilled", true);
    })()
      .catch((error) => {
        console.error("[contacts] failed to name the local user", error);
      })
      .finally(() => {
        running.current = false;
      });
  }, [done, ownerUserId, self]);

  return null;
}

export function YourName() {
  const { t } = useLingui();
  const ownerUserId = useOwnerUserId();
  const { data: self } = usePersonalContact(ownerUserId ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const saved = self?.name ?? "";

  const commit = () => {
    if (draft === null || !ownerUserId) return;
    const name = draft.trim();
    setDraft(null);
    if (name === saved.trim()) return;
    updateHuman(ownerUserId, { name }).catch((error) => {
      console.error("[contacts] failed to rename the local user", error);
    });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor="your-name" className="text-ui font-medium">
          <Trans>Your name</Trans>
        </label>
        <p className="text-muted-foreground text-label">
          <Trans>Shown for your voice in transcripts. Empty shows “You”.</Trans>
        </p>
      </div>
      <Input
        id="your-name"
        className="h-8 w-48 shrink-0"
        placeholder={t`You`}
        disabled={!self}
        value={draft ?? saved}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
      />
    </div>
  );
}
