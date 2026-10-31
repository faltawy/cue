import { startTransition, useActionState } from "react";

import { type MeetingCoaching } from "../../coaching-preferences";
import { type ActionResult, type CoachApi } from "../use-coach";

export const PARKING_LIMIT = { count: 12, length: 300 };

export function MeetingNotes({
  coaching,
  disabled,
  onSave,
}: {
  coaching: MeetingCoaching & { sessionId: string };
  disabled: boolean;
  onSave: CoachApi["setCoaching"];
}) {
  const [result, save, pending] = useActionState(
    async (_: ActionResult | null, data: FormData): Promise<ActionResult> => {
      const goal = String(data.get("goal") ?? "").trim();
      const parking = String(data.get("parking") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (
        parking.length > PARKING_LIMIT.count ||
        parking.some((line) => line.length > PARKING_LIMIT.length)
      )
        return {
          ok: false,
          message: "Keep up to 12 thoughts, each under 300 characters.",
        };
      return onSave({ sessionId: coaching.sessionId, goal, parking });
    },
    null,
  );

  return (
    <details className="border-border border-b px-1 pb-1 text-[12px]">
      <summary className="text-muted-foreground hover:text-foreground flex h-7 cursor-pointer list-none items-center rounded-md px-1">
        Goal & private notes
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => save(data));
        }}
        className="mt-1 grid gap-3 px-1 pb-2"
      >
        <label className="grid gap-1">
          What do you need from this meeting?
          <input
            disabled={pending}
            name="goal"
            defaultValue={coaching.goal ?? ""}
            maxLength={500}
            placeholder="A clear owner and launch date"
            className="border-border bg-surface rounded-md border p-2"
          />
        </label>
        <label className="grid gap-1">
          Private parking lot
          <textarea
            disabled={pending}
            name="parking"
            defaultValue={(coaching.parking ?? []).join("\n")}
            rows={2}
            placeholder="One thought per line. Save it without interrupting."
            className="border-border bg-surface resize-y rounded-md border p-2"
          />
        </label>
        <button
          type="submit"
          disabled={disabled || pending}
          className="hover:bg-muted border-border justify-self-start rounded-md border px-3 py-1.5 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save for this meeting"}
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"}>
            {result.ok ? "Saved privately for this meeting." : result.message}
          </p>
        )}
      </form>
    </details>
  );
}
