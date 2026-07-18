import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import {
  createRuntimeSentryConfig,
  sanitizeMobileSentryContext,
  shouldEnableReplay,
} from "./sentry-config";

type SentryLevel = "info" | "warning" | "error";

const extra = Constants.expoConfig?.extra ?? {};
let sentryInitialized = false;

function getSentryDsn() {
  return extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN;
}

function shouldEnableSentryReplay() {
  return shouldEnableReplay(process.env);
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
    ...createRuntimeSentryConfig(
      { ...process.env, EXPO_PUBLIC_SENTRY_DSN: String(getSentryDsn()) },
      environment,
    ),
    enableNativeFramesTracking: !isRunningInExpoGo(),
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

  Sentry.captureException(error, {
    extra: sanitizeMobileSentryContext(context) as Record<string, unknown> | undefined,
  });
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
      scope.setExtras(sanitizeMobileSentryContext(context) as Record<string, unknown>);
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
    data: sanitizeMobileSentryContext(data) as Record<string, unknown> | undefined,
    level: "info",
    message,
  });
}

export function withErrorBoundary<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  context?: string,
): (...args: Args) => Result {
  return ((...args: Args) => {
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
  }) as (...args: Args) => Result;
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
