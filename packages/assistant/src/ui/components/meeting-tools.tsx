import {
  Compass,
  ChevronDown,
  MessageCircle,
  ListChecks,
  CircleHelp,
  History,
  Monitor,
  Bookmark,
  Flag,
  Target,
} from "lucide-react";
import { startTransition, useActionState } from "react";

import { type MeetingCoaching } from "../../coaching-preferences";
import { MEETING_ACTIONS, MeetingAction } from "../../meeting-actions";
import { type CoachApi, type ActionResult } from "../use-coach";

const ICONS = {
  [MeetingAction.NextWords]: MessageCircle,
  [MeetingAction.CatchUp]: History,
  [MeetingAction.Promises]: ListChecks,
  [MeetingAction.Questions]: CircleHelp,
  [MeetingAction.Memory]: History,
  [MeetingAction.Screen]: Monitor,
  [MeetingAction.Parking]: Bookmark,
  [MeetingAction.Close]: Flag,
  [MeetingAction.Goal]: Target,
};

export function MeetingTools({
  coaching,
  disabled,
  api,
}: {
  coaching: MeetingCoaching & { sessionId: string };
  disabled: boolean;
  api: CoachApi;
}) {
  const [result, save, pending] = useActionState(
    async (_: ActionResult | null, data: FormData): Promise<ActionResult> => {
      const goal = String(data.get("goal") ?? "").trim();
      const parking = String(data.get("parking") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (parking.length > 12 || parking.some((line) => line.length > 300))
        return {
          ok: false,
          message: "Keep up to 12 thoughts, each under 300 characters.",
        };
      return api.setCoaching({ sessionId: coaching.sessionId, goal, parking });
    },
    null,
  );

  return (
    <details
      data-meeting-tools
      className="group/meeting-tools border-border text-ui shrink-0 border-t"
    >
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-2 px-4 py-2.5">
        <Compass size={14} aria-hidden="true" /> Meeting tools
        {coaching.goal && <Target size={12} aria-label="Meeting goal saved" />}
        {!!coaching.parking?.length && (
          <span className="text-label">{coaching.parking.length} parked</span>
        )}
        <ChevronDown
          size={14}
          className="ms-auto shrink-0 transition-transform group-open/meeting-tools:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="meeting-tools-content coach-scroll max-h-[min(320px,40dvh)] [scrollbar-gutter:stable] overflow-y-auto overscroll-contain px-3 pb-3">
        <div className="grid grid-cols-2 gap-1">
          {Object.values(MeetingAction).map((action) => {
            const Icon = ICONS[action];
            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-2 text-start disabled:opacity-40"
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  void api.ask(MEETING_ACTIONS[action].label, [], action);
                }}
              >
                <Icon size={14} className="shrink-0" aria-hidden="true" />
                {MEETING_ACTIONS[action].label}
              </button>
            );
          })}
        </div>
        <details className="border-border mt-3 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1">
            Goal & private notes
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              startTransition(() => save(data));
            }}
            className="mt-3 grid gap-3 px-2"
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
                {result.ok
                  ? "Saved privately for this meeting."
                  : result.message}
              </p>
            )}
          </form>
        </details>
      </div>
    </details>
  );
}
