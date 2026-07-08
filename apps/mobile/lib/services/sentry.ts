import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";

type SentryLevel = "info" | "warning" | "error";

const extra = Constants.expoConfig?.extra ?? {};
let sentryInitialized = false;

function readSampleRate(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSentryDsn() {
  return extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN;
}

function shouldEnableSentryReplay() {
  if (__DEV__) {
    return process.env.EXPO_PUBLIC_ENABLE_SENTRY_REPLAY_IN_DEV === "1";
  }

  return (
    readSampleRate(process.env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 1) > 0 ||
    readSampleRate(process.env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0) > 0
  );
}

function shouldEnableSentry(): boolean {
  const dsn = getSentryDsn();
  if (!dsn) {
    return false;
  }

  return !__DEV__ || process.env.EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV === "1";
}

export function initSentry() {
  if (!shouldEnableSentry() || sentryInitialized) {
    return;
  }

  const environment = String(
    extra.appEnv ?? process.env.APP_ENV ?? (__DEV__ ? "development" : "production"),
  );

  Sentry.init({
    dsn: String(getSentryDsn()),
    enableLogs: true,
    enableNativeFramesTracking: !isRunningInExpoGo(),
    environment,
    integrations(integrations) {
      integrations.push(
        Sentry.expoRouterIntegration({
          enableTimeToInitialDisplay: !isRunningInExpoGo(),
        }),
      );

      if (shouldEnableSentryReplay()) {
        integrations.push(
          Sentry.mobileReplayIntegration({
            maskAllImages: true,
            maskAllText: true,
            maskAllVectors: true,
          }),
        );
      }

      return integrations;
    },
    replaysOnErrorSampleRate: readSampleRate(
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
      1,
    ),
    replaysSessionSampleRate: readSampleRate(
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
      0,
    ),
    sendDefaultPii: process.env.EXPO_PUBLIC_SENTRY_SEND_DEFAULT_PII === "1",
    tracesSampleRate: readSampleRate(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 1),
    beforeSend(event) {
      if (event.message?.includes("Network request failed") && __DEV__) {
        return null;
      }

      return event;
    },
  });
  sentryInitialized = true;
}

export function captureException(error: Error, context?: Record<string, unknown>) {
  initSentry();

  if (!sentryInitialized) {
    if (__DEV__) {
      console.error("Error captured (Sentry disabled):", error, context);
    }
    return;
  }

  Sentry.captureException(error, { extra: context });
}

export function captureMessage(
  message: string,
  level: SentryLevel = "info",
  context?: Record<string, unknown>,
) {
  initSentry();

  if (!sentryInitialized) {
    if (__DEV__) {
      console.log(`Message captured (Sentry disabled) [${level}]:`, message, context);
    }
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureMessage(message, level);
  });
}

export function setUser(user: { id: string; email?: string; username?: string }) {
  initSentry();

  if (!sentryInitialized) {
    return;
  }

  Sentry.setUser({
    email: user.email,
    id: user.id,
    username: user.username,
  });
}

export function clearUser() {
  initSentry();

  if (sentryInitialized) {
    Sentry.setUser(null);
  }
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  initSentry();

  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb({
    category,
    data,
    level: "info",
    message,
  });
}

export function withErrorBoundary<T extends (...args: any[]) => any>(fn: T, context?: string): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.catch((error) => {
          captureException(error, { context });
          throw error;
        });
      }

      return result;
    } catch (error) {
      captureException(error as Error, { context });
      throw error;
    }
  }) as T;
}

export function startTransaction(name: string, operation: string) {
  initSentry();

  if (!sentryInitialized) {
    return null;
  }

  Sentry.addBreadcrumb({
    category: "performance",
    data: { operation },
    level: "info",
    message: name,
  });

  return null;
}

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export { Sentry };
export default Sentry;
