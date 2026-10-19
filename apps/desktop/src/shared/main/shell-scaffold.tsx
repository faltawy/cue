import { cn } from "@anlg/utils";

import { SyncProvider } from "~/calendar/components/context";

export type MainSurfaceChrome = "default" | "top" | "top-borderless" | "left";

export function MainShellScaffold({
  children,
  edgeToEdge = false,
  mainSurfaceChrome,
}: {
  children: React.ReactNode;
  edgeToEdge?: boolean;
  mainSurfaceChrome?: MainSurfaceChrome;
}) {
  const resolvedMainSurfaceChrome =
    mainSurfaceChrome ?? (edgeToEdge ? "top" : "default");
  const hasTopMainSurfaceChrome =
    resolvedMainSurfaceChrome === "top" ||
    resolvedMainSurfaceChrome === "top-borderless";

  return (
    <SyncProvider>
      <div
        className={cn([
          "bg-background flex h-full gap-1 overflow-hidden",
          !hasTopMainSurfaceChrome && "ps-1",
          hasTopMainSurfaceChrome && [
            "[&_[data-chat-floating-anchor]]:rounded-t-xl",
            "[&_[data-chat-floating-anchor]]:rounded-b-none",
            "[&_[data-chat-floating-anchor]]:border-x-0",
            resolvedMainSurfaceChrome === "top"
              ? "[&_[data-chat-floating-anchor]]:border-t"
              : "[&_[data-chat-floating-anchor]]:!border-t-0",
            "[&_[data-chat-floating-anchor]]:border-b-0",
          ],
          resolvedMainSurfaceChrome === "left" && [
            "[&_[data-chat-floating-anchor]]:rounded-s-xl",
            "[&_[data-chat-floating-anchor]]:rounded-e-none",
            "[&_[data-chat-floating-anchor]]:border-y-0",
            "[&_[data-chat-floating-anchor]]:border-e-0",
            "[&_[data-chat-floating-anchor]]:border-s",
          ],
        ])}
        data-testid="main-app-shell"
      >
        {children}
      </div>
    </SyncProvider>
  );
}
