import { startTransition, useActionState } from "react";

import {
  type MeetingCoaching,
  MeetingIntent,
} from "../../coaching-preferences";
import { type ActionResult, type CoachApi } from "../use-coach";

export function useMeetingControls(
  sessionId: string | undefined,
  onChange: CoachApi["setCoaching"],
) {
  const [result, update, pending] = useActionState(
    async (
      _previous: ActionResult | null,
      patch: Partial<MeetingCoaching>,
    ): Promise<ActionResult> => {
      try {
        if (!sessionId) return { ok: false, message: "No active meeting." };
        return await onChange({ ...patch, sessionId });
      } catch {
        return {
          ok: false,
          message: "Couldn't update meeting preferences. Try again.",
        };
      }
    },
    null,
  );
  return {
    result,
    pending,
    update: (patch: Partial<MeetingCoaching>) =>
      startTransition(() => update(patch)),
  };
}

export function MeetingControls({
  coaching,
  disabled,
  update,
  pending,
  result,
}: {
  coaching: MeetingCoaching;
  disabled: boolean;
  update: (patch: Partial<MeetingCoaching>) => void;
  pending: boolean;
  result: ActionResult | null;
}) {
  return (
    <div className="border-border border-b px-2 pb-2 text-[12px]">
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3">
          <span>Meeting intention</span>
          <select
            value={coaching.intent}
            disabled={disabled || pending}
            onChange={(event) => {
              const intent = event.target.value as MeetingIntent;
              update({ intent });
            }}
            className="border-border bg-surface text-foreground min-w-0 rounded-md border px-1.5 py-1"
          >
            <option value={MeetingIntent.General}>General</option>
            <option value={MeetingIntent.Listening}>Listening</option>
            <option value={MeetingIntent.Presenting}>Presenting</option>
            <option value={MeetingIntent.Supporting}>Supporting</option>
            <option value={MeetingIntent.Negotiating}>Negotiating</option>
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => update({ quiet: !coaching.quiet })}
          className="hover:bg-muted -mx-1 rounded-md px-1 py-1 text-start disabled:opacity-50"
        >
          {coaching.quiet ? "Resume suggestions" : "Quiet for this meeting"}
        </button>
        {pending && <span role="status">Saving…</span>}
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-destructive mt-1">
          {result.message}
        </p>
      )}
    </div>
  );
}
