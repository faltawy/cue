import type { SetupView } from "../../protocol";
import { type CoachProvider, providerName } from "../../provider";
import { Button } from "./primitives";

export function setupLabel(
  setup: SetupView,
  provider: CoachProvider = "claude",
): string | null {
  switch (setup.state) {
    case "checking":
      return `Setting up ${providerName(provider)}…`;
    case "downloading":
      return setup.percent === null
        ? `Setting up ${providerName(provider)}…`
        : `Setting up ${providerName(provider)}… ${setup.percent}%`;
    case "failed":
      return "The coach couldn't set up.";
    case "ready":
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
      <Button tone="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
