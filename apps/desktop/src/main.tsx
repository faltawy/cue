// Must be the first import: React only reports commits to a devtools hook that
// exists before react-dom evaluates.
import "./devtools-bar/render-hook";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./styles/globals.css";
import "./styles/cursor.css";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { StrictMode, useMemo } from "react";
import ReactDOM from "react-dom/client";

import {
  StaticWindowLabel,
  getCurrentWebviewWindowLabel,
  init as initWindowsPlugin,
} from "@anlg/plugin-windows";
import { AppToastTheme } from "@anlg/ui/components/ui/app-toast";
import { ToastPosition, Toaster } from "@anlg/ui/components/ui/toast";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { AITaskWindowSyncBridge } from "./ai/task-window-sync";
import {
  captureOperationalError,
  installGlobalErrorLogging,
  reportCaughtReactError,
} from "./error-reporting";
import { AppI18nProvider } from "./i18n/provider";
import { routeTree } from "./routeTree.gen";
import { EventListeners } from "./services/event-listeners";
import { TaskManager } from "./services/task-manager";
import {
  createTaskScheduler,
  TaskSchedulerProvider,
} from "./services/task-scheduler";
import { TrayRecordingSync } from "./services/tray-recording";
import { TrayScheduleSync } from "./services/tray-schedule";
import { useRemoteSessionDeletionUndoListener } from "./session/hooks/useDeleteSession";
import { refreshLegacySettingsSnapshots } from "./settings/legacy-snapshots";
import { migratePlaintextAiProviderApiKeys } from "./settings/providers";
import { initializeApplicationSettings } from "./settings/queries";
import { initializeAppExitFlush } from "./shared/app-exit";
import { useConfigValue } from "./shared/config";
import { ErrorComponent, NotFoundComponent } from "./shared/control";
import { LongLoadGate } from "./shared/long-load-gate";
import { startInteractionProfiler } from "./shared/perf/interaction-profiler";
import { bootstrapThemeFromSettings } from "./shared/theme/apply";
import { AppThemeProvider } from "./shared/theme/provider";
import { createAITaskStore } from "./store/zustand/ai-task";
import { listenerStore } from "./store/zustand/listener/instance";

import { type ThemePreference } from "~/shared/enums";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      captureOperationalError(
        { errorType: error.name },
        {
          operation: "query",
          context: { failures: query.state.fetchFailureCount },
        },
      ),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      captureOperationalError(
        { errorType: error.name },
        {
          operation: "mutation",
          context: { mutationId: mutation.mutationId },
        },
      ),
  }),
  defaultOptions: {
    queries: {
      gcTime: 60_000,
    },
  },
});
const STARTUP_TASK_TIMEOUT_MS = 10_000;

const router = createRouter({
  routeTree,
  context: undefined,
  defaultErrorComponent: ErrorComponent,
  defaultNotFoundComponent: NotFoundComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const aiTaskStore = useMemo(() => createAITaskStore(), []);

  return (
    <>
      <AITaskWindowSyncBridge store={aiTaskStore} />
      <RouterProvider
        router={router}
        context={{
          listenerStore,
          aiTaskStore,
        }}
      />
    </>
  );
}

installGlobalErrorLogging();

function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <LongLoadGate>
        <ReadyApp />
      </LongLoadGate>
    </QueryClientProvider>
  );
}

function ReadyApp() {
  const scheduler = useMemo(() => createTaskScheduler().start(), []);
  const theme = useConfigValue("theme") as ThemePreference;
  useRemoteSessionDeletionUndoListener(isMainWindow);

  useMountEffect(() => {
    runMainWindowStartupTasks();
  });

  return (
    <MotionConfig reducedMotion="user">
      <AppThemeProvider>
        <AppI18nProvider>
          <TaskSchedulerProvider scheduler={scheduler}>
            <App />
            {isMainWindow ? <TaskManager /> : null}
            {isMainWindow ? <EventListeners /> : null}
            {isMainWindow ? <TrayScheduleSync /> : null}
            {isMainWindow ? <TrayRecordingSync /> : null}
            <Toaster
              position={ToastPosition.BottomRight}
              theme={
                {
                  light: AppToastTheme.Light,
                  dark: AppToastTheme.Dark,
                  system: AppToastTheme.System,
                }[theme]
              }
            />
          </TaskSchedulerProvider>
        </AppI18nProvider>
      </AppThemeProvider>
    </MotionConfig>
  );
}

initWindowsPlugin();

const isMainWindow = getCurrentWebviewWindowLabel() === StaticWindowLabel.Main;

if (isMainWindow) {
  void initializeAppExitFlush().catch((error) => {
    captureOperationalError(error, {
      operation: "app_exit_flush_initialize",
    });
  });
}

const rootElement = document.getElementById("root")!;

async function renderApp() {
  if (import.meta.env.DEV) {
    startInteractionProfiler();
  }

  await bootstrapThemeFromSettings();
  const root = ReactDOM.createRoot(rootElement, {
    onCaughtError: reportCaughtReactError,
  });
  root.render(
    <StrictMode>
      <AppRoot />
    </StrictMode>,
  );
}

if (!rootElement.innerHTML) {
  void renderApp();
}

function runMainWindowStartupTasks() {
  if (!isMainWindow) {
    return;
  }

  void runStartupTask(
    "legacy_settings_refresh",
    refreshLegacySettingsSnapshots,
  );
  void runStartupTask(
    "application_settings_initialize",
    initializeApplicationSettings,
  );
  void runStartupTask(
    "ai_credentials_migrate",
    migratePlaintextAiProviderApiKeys,
  );
}

async function runStartupTask(
  operation: string,
  task: () => Promise<void>,
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  await new Promise<void>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`startup operation timed out: ${operation}`));
    }, STARTUP_TASK_TIMEOUT_MS);

    void task().then(resolve, reject);
  })
    .catch((error) => {
      captureOperationalError(error, { operation });
    })
    .finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    });
}
