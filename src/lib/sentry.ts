import * as Sentry from "@sentry/nextjs";

export function initializeSentry() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      enabled: process.env.NODE_ENV === "production",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      debug: process.env.NODE_ENV === "development",
      maxBreadcrumbs: 50,
      integrations: (integrations) => [
        ...integrations.filter(
          (integration) =>
            integration.name !== "Breadcrumbs" &&
            integration.name !== "Console"
        ),
      ],
    });
  }
}

export function captureException(error: Error | string | unknown, context?: Record<string, unknown>) {
  const normalizedError = error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : String(error));

  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(normalizedError, {
      contexts: { app: context },
    });
  } else {
    console.error("[ERROR]", normalizedError.message, context);
  }
}

export function captureMessage(message: string, level: "fatal" | "error" | "warning" | "info" = "info") {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  } else {
    const consoleLevel = level === "fatal" || level === "error" ? "error" : level === "warning" ? "warn" : "info";
    console[consoleLevel](message);
  }
}

export function addBreadcrumb(
  message: string,
  category: string,
  level: "info" | "warning" | "error" = "info"
) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      timestamp: Date.now() / 1000,
    });
  }
}

export function setSentryUser(userId: string, email?: string) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.setUser({ id: userId, email });
  }
}

export function clearSentryUser() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.setUser(null);
  }
}
