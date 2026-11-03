import { extractSafeErrorDiagnostic } from "@repo/api/telemetry-sanitizer";
import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { omitUndefined } from "../omitUndefined";
import {
  createRuntimeSentryConfig,
  sanitizeMobileSentryContext,
  shouldEnableReplay,
} from "./sentry-config";
import {
  type MobileSentryEnvironment,
  shouldEnableSentry as shouldEnableSentryRuntime,
} from "./sentry-options.js";

type SentryLevel = "info" | "warning" | "error";

const extra = Constants.expoConfig?.extra ?? {};
let sentryInitialized = false;

function getSentryDsn() {
  return extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN;
}

function getSentryEnvironment(): MobileSentryEnvironment {
  // Expo replaces only direct EXPO_PUBLIC_* property access in the app bundle.
  return {
    EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV: process.env.EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV,
    EXPO_PUBLIC_ENABLE_SENTRY_REPLAY: process.env.EXPO_PUBLIC_ENABLE_SENTRY_REPLAY,
    EXPO_PUBLIC_MAESTRO_E2E: process.env.EXPO_PUBLIC_MAESTRO_E2E,
    EXPO_PUBLIC_SENTRY_DSN: getSentryDsn(),
    EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
    EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  };
}

function shouldEnableSentryReplay() {
  return shouldEnableReplay(getSentryEnvironment());
}

function shouldEnableSentry(): boolean {
  const environment = getSentryEnvironment();
  return shouldEnableSentryRuntime(environment, __DEV__, environment.EXPO_PUBLIC_SENTRY_DSN);
}

export function initSentry() {
  if (!shouldEnableSentry() || sentryInitialized) {
    return;
  }

  const environment = String(
    extra.appEnv ?? process.env.APP_ENV ?? (__DEV__ ? "development" : "production"),
  );

  Sentry.init({
    ...createRuntimeSentryConfig(getSentryEnvironment(), environment),
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
      console.error("[sentry-disabled]", {
        ...sanitizeMobileSentryContext(context),
        ...extractSafeErrorDiagnostic(error),
      });
    }
    return;
  }

  Sentry.withScope((scope) => {
    const sanitizedContext = sanitizeMobileSentryContext(context);
    if (sanitizedContext) {
      scope.setExtras(sanitizedContext);
    }
    Sentry.captureException(error);
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
      console.log("[sentry-disabled-message]", { level, ...sanitizeMobileSentryContext(context) });
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
    id: user.id,
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

  Sentry.addBreadcrumb(
    omitUndefined({
      category,
      data: sanitizeMobileSentryContext(data),
      level: "info",
      message,
    }),
  );
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
