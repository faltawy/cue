import type { SetupView } from "../../protocol";
import { Button } from "./primitives";

export function setupLabel(setup: SetupView): string | null {
  switch (setup.state) {
    case "checking":
      return "Setting up the coach…";
    case "downloading":
      return setup.percent === null ? "Setting up the coach…" : `Setting up the coach… ${setup.percent}%`;
    case "failed":
      return "The coach couldn't set up.";
    case "ready":
      return null;
  }
}

export function SetupFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 px-3 py-2 text-[12.5px]">
      <p className="min-w-0 flex-1 text-foreground">{message}</p>
      <Button tone="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
