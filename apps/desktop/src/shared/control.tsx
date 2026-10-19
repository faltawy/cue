import { t } from "@lingui/core/macro";
import {
  type ErrorRouteComponent,
  NotFoundRouteComponent,
  useNavigate,
} from "@tanstack/react-router";
import { relaunch } from "@tauri-apps/plugin-process";
import { motion } from "motion/react";

import { ArrowClockwise, House, Warning } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { captureOperationalError } from "~/error-reporting";

const routeErrorKeys = new WeakMap<object, number>();
let nextRouteErrorKey = 0;

function getRouteErrorKey(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }

  const existing = routeErrorKeys.get(error);
  if (existing !== undefined) {
    return existing;
  }

  nextRouteErrorKey += 1;
  routeErrorKeys.set(error, nextRouteErrorKey);
  return nextRouteErrorKey;
}

const ReportedErrorComponent = ({ error }: { error: Error }) => {
  useMountEffect(() => {
    captureOperationalError(error, {
      operation: "route_render",
    });
  });

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      captureOperationalError(err, {
        operation: "app_restart",
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-50 h-10 bg-transparent"
      />

      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        >
          <div className="border-destructive/30 bg-destructive/[0.06] flex flex-col gap-2.5 rounded-lg border px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Warning className="text-destructive mt-0.5 size-4 shrink-0" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="text-strong text-foreground font-medium">
                  {t`Something went wrong`}
                </h2>
                <p className="text-muted-foreground text-ui break-words">
                  {error.message || t`An unexpected error occurred.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleRestart}>
                <ArrowClockwise />
                {t`Restart App`}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export const ErrorComponent: ErrorRouteComponent = ({ error }) => (
  <ReportedErrorComponent key={getRouteErrorKey(error)} error={error} />
);

export const NotFoundComponent: NotFoundRouteComponent = () => {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-50 h-10 bg-transparent"
      />

      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        >
          <div className="m-auto flex max-w-[340px] flex-col items-center gap-3 py-8 text-center">
            <div>
              <h2 className="text-title text-foreground">
                {t`Page not found`}
              </h2>
              <p className="text-muted-foreground text-ui mt-1 text-balance">
                {t`The page you're looking for doesn't exist.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: "/app" })}
            >
              <House />
              {t`Go to Home`}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
