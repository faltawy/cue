import { cn } from "@anlg/utils";

import { SyncProvider } from "~/calendar/components/context";
import { MainSurfaceChrome } from "~/shared/enums";

export { MainSurfaceChrome };

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
    mainSurfaceChrome ??
    (edgeToEdge ? MainSurfaceChrome.Top : MainSurfaceChrome.Default);
  const hasTopMainSurfaceChrome =
    resolvedMainSurfaceChrome === MainSurfaceChrome.Top ||
    resolvedMainSurfaceChrome === MainSurfaceChrome.TopBorderless;

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
            resolvedMainSurfaceChrome === MainSurfaceChrome.Top
              ? "[&_[data-chat-floating-anchor]]:border-t"
              : "[&_[data-chat-floating-anchor]]:!border-t-0",
            "[&_[data-chat-floating-anchor]]:border-b-0",
          ],
          resolvedMainSurfaceChrome === MainSurfaceChrome.Left && [
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
