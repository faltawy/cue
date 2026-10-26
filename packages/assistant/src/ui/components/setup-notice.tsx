import { SetupState, type SetupView } from "../../protocol";
import { CoachProvider, providerName } from "../../provider";
import { Button, Tone } from "./primitives";

export function setupLabel(
  setup: SetupView,
  provider: CoachProvider = CoachProvider.Claude,
): string | null {
  switch (setup.state) {
    case SetupState.Checking:
      return `Setting up ${providerName(provider)}…`;
    case SetupState.Downloading:
      return setup.percent === null
        ? `Setting up ${providerName(provider)}…`
        : `Setting up ${providerName(provider)}… ${setup.percent}%`;
    case SetupState.Failed:
      return "The coach couldn't set up.";
    case SetupState.Ready:
      return null;
  }
}

export function SetupFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-destructive/40 flex items-start gap-3 rounded-lg border px-3 py-2 text-[12.5px]"
    >
      <p className="text-foreground min-w-0 flex-1">{message}</p>
      <Button tone={Tone.Outline} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
