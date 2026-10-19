type ErrorContextValue = null | boolean | number | string;

export function captureOperationalError(
  error: unknown,
  {
    operation,
    tags,
    context,
  }: {
    operation: string;
    tags?: Record<string, ErrorContextValue>;
    context?: Record<string, ErrorContextValue>;
  },
) {
  const details = { ...tags, ...context };
  if (Object.keys(details).length > 0) {
    console.error(`[${operation}] failed`, error, details);
  } else {
    console.error(`[${operation}] failed`, error);
  }
}

export function reportCaughtReactError(error: unknown) {
  console.error("[react] caught render error", error);
}

export function installGlobalErrorLogging() {
  window.addEventListener("error", (event) => {
    console.error("[window] uncaught error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[window] unhandled promise rejection", event.reason);
  });
}
