import { startTransition, useActionState } from "react";

import {
  type MeetingCoaching,
  MeetingIntent,
} from "../../coaching-preferences";
import { type ActionResult, type CoachApi } from "../use-coach";

export function MeetingControls({
  coaching,
  ready,
  onChange,
}: {
  coaching: MeetingCoaching & { sessionId: string };
  ready: boolean;
  onChange: CoachApi["setCoaching"];
}) {
  const [result, update, pending] = useActionState(
    async (
      _previous: ActionResult | null,
      patch: Partial<MeetingCoaching>,
    ): Promise<ActionResult> => {
      try {
        return await onChange({ ...patch, sessionId: coaching.sessionId });
      } catch {
        return {
          ok: false,
          message: "Couldn't update meeting preferences. Try again.",
        };
      }
    },
    null,
  );
  return (
    <div className="border-border text-muted-foreground border-b px-4 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2">
          <span>Meeting intention</span>
          <select
            value={coaching.intent}
            disabled={!ready || pending}
            onChange={(event) => {
              const intent = event.target.value as MeetingIntent;
              startTransition(() => update({ intent }));
            }}
            className="border-border bg-surface text-foreground min-w-0 rounded border px-1.5 py-1"
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
          disabled={!ready || pending}
          onClick={() =>
            startTransition(() => update({ quiet: !coaching.quiet }))
          }
          className="hover:text-foreground disabled:opacity-50"
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
