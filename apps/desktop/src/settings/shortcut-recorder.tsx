import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";

import { commands as shortcuts } from "@anlg/plugin-shortcut";
import { Button } from "@anlg/ui/components/ui/button";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

export function ShortcutRecorder({
  id,
  label,
  shortcut,
  save: persist,
  prepare = async () => {},
  onRecordingChange = () => {},
  nativeKeys = false,
}: {
  id: string;
  label: ReactNode;
  shortcut: string;
  save: (value: string) => Promise<void>;
  prepare?: () => Promise<void>;
  onRecordingChange?: (recording: boolean) => void;
  nativeKeys?: boolean;
}) {
  const { t } = useLingui();
  const [recording, setRecording] = useState(false);
  const attempt = useRef(0);
  const persisting = useRef(false);
  const ready = useMutation({ mutationFn: prepare });
  const save = useMutation({
    mutationFn: async ({ value, token }: { value: string; token: number }) => {
      const result = await shortcuts.validate(value);
      if (token !== attempt.current) return;
      if (result.status === "error") throw new Error(result.error);
      persisting.current = true;
      setRecording(false);
      onRecordingChange(false);
      try {
        await persist(value);
      } finally {
        persisting.current = false;
      }
    },
    onError: (_, { token }) => {
      if (token !== attempt.current) return;
      setRecording(false);
      onRecordingChange(false);
    },
    onSuccess: (_, { token }) => {
      if (token === attempt.current) finish();
    },
  });

  function finish() {
    if (persisting.current) return;
    attempt.current += 1;
    setRecording(false);
    onRecordingChange(false);
    save.reset();
  }

  useMountEffect(() => () => {
    attempt.current += 1;
    onRecordingChange(false);
  });

  const labels: Record<string, string> = {
    Control: "⌃",
    Alt: "⌥",
    Shift: "⇧",
    Super: "⌘",
    Meta: "⌘",
    Fn: t`Fn / Globe`,
    RightCommand: t`Right Command`,
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <Button
          type="button"
          variant="outline"
          aria-labelledby={`${id}-label`}
          aria-pressed={recording}
          disabled={save.isPending && !recording}
          aria-busy={save.isPending && !recording}
          onClick={() => {
            if (recording) return finish();
            attempt.current += 1;
            save.reset();
            onRecordingChange(true);
            ready.mutate();
            setRecording(true);
          }}
          onBlur={finish}
          onKeyDown={(event) => {
            if (!recording) return;
            event.stopPropagation();
            if (event.key === "Tab") {
              finish();
              return;
            }
            event.preventDefault();
            if (event.key === "Escape") return finish();
            if (event.repeat || !ready.isSuccess || save.isPending) return;
            if (["Control", "Alt", "Meta", "Shift", "Fn"].includes(event.key))
              return;
            const modifiers = [
              event.ctrlKey && "Control",
              event.altKey && "Alt",
              event.shiftKey && "Shift",
              event.metaKey && "Super",
            ].filter(Boolean);
            save.mutate({
              value: [...modifiers, event.code].join("+"),
              token: attempt.current,
            });
          }}
        >
          {recording ? (
            !ready.isSuccess ? (
              <Trans>Preparing…</Trans>
            ) : (
              <Trans>Press shortcut…</Trans>
            )
          ) : (
            <span className="inline-flex items-center gap-1">
              {shortcut.split("+").map((key) => (
                <kbd
                  key={key}
                  className="bg-muted rounded border px-1.5 py-0.5 font-sans text-xs"
                >
                  {labels[key] ?? key.replace(/^(Key|Digit)/, "")}
                </kbd>
              ))}
            </span>
          )}
        </Button>
      </div>
      {recording && (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          <Trans>Press the new keys. Esc cancels.</Trans>
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-destructive text-sm">
          {save.error.message}
        </p>
      )}
      {nativeKeys && (
        <div className="flex gap-2">
          {[
            ["Fn", t`Fn / Globe`],
            ["RightCommand", t`Right Command`],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ value, token: attempt.current })}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
