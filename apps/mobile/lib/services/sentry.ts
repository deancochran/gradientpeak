/**
 * Sentry Error Tracking Integration
 *
 * Provides production error tracking and monitoring for the mobile app.
 * Currently configured as a placeholder - install @sentry/react-native to enable.
 *
 * Installation:
 * 1. Run: npx expo install @sentry/react-native
 * 2. Add SENTRY_DSN to .env.local
 * 3. Uncomment the import and initialization code below
 *
 * @see https://docs.sentry.io/platforms/react-native/
 */

import Constants from "expo-constants";

// Uncomment when @sentry/react-native is installed
// import * as Sentry from "@sentry/react-native";

interface SentryConfig {
  dsn: string;
  environment: string;
  enableInExpoDevelopment?: boolean;
  tracesSampleRate?: number;
  beforeSend?: (event: any, hint?: any) => any | null;
}

/**
 * Check if Sentry should be enabled
 */
function shouldEnableSentry(): boolean {
  // Don't enable in development unless explicitly configured
  if (__DEV__) {
    return false;
  }

  // Check if DSN is configured
  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  if (!dsn || dsn === "") {
    console.warn("Sentry DSN not configured. Error tracking disabled.");
    return false;
  }

  return true;
}

/**
 * Initialize Sentry error tracking
 *
 * Call this early in your app initialization, typically in _layout.tsx
 */
export function initSentry() {
  if (!shouldEnableSentry()) {
    console.log("Sentry disabled in development mode");
    return;
  }

  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  const environment = __DEV__ ? "development" : "production";

  console.log(`Initializing Sentry for ${environment} environment`);

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.init({
    dsn,
    environment,
    enableNative: true,
    tracesSampleRate: 0.2, // 20% of transactions for performance monitoring

    // Don't send errors for common React Native warnings
    beforeSend(event, hint) {
      // Filter out expo-crypto warnings in development
      if (event.message?.includes("expo-crypto") && __DEV__) {
        return null;
      }

      // Filter out network errors in development
      if (event.message?.includes("Network request failed") && __DEV__) {
        return null;
      }

      return event;
    },

    // Attach user context automatically
    integrations: [
      new Sentry.ReactNativeTracing({
        routingInstrumentation: new Sentry.ReactNavigationInstrumentation(),
      }),
    ],
  });
  */
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (!shouldEnableSentry()) {
    console.error("Error captured (Sentry disabled):", error, context);
    return;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.captureException(error, {
    extra: context,
  });
  */
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, any>,
) {
  if (!shouldEnableSentry()) {
    console.log(`Message captured (Sentry disabled) [${level}]:`, message, context);
    return;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.captureMessage(message, {
    level: level as Sentry.SeverityLevel,
    extra: context,
  });
  */
}

/**
 * Set user context for error tracking
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
}) {
  if (!shouldEnableSentry()) {
    return;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  */
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearUser() {
  if (!shouldEnableSentry()) {
    return;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.setUser(null);
  */
}

/**
 * Add breadcrumb for debugging context
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, any>,
) {
  if (!shouldEnableSentry()) {
    return;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
  */
}

/**
 * Wrap a function with error boundary
 */
export function withErrorBoundary<T extends (...args: any[]) => any>(
  fn: T,
  context?: string,
): T {
  return ((...args: any[]) => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          captureException(error, { context, args });
          throw error;
        });
      }

      return result;
    } catch (error) {
      captureException(error as Error, { context, args });
      throw error;
    }
  }) as T;
}

/**
 * Performance monitoring utility
 */
export function startTransaction(name: string, operation: string) {
  if (!shouldEnableSentry()) {
    return null;
  }

  // Uncomment when @sentry/react-native is installed
  /*
  return Sentry.startTransaction({
    name,
    op: operation,
  });
  */

  return null;
}

/**
 * Custom error class for app-specific errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public context?: Record<string, any>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Export placeholder Sentry for compatibility
export const Sentry = {
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  startTransaction,
  Native: {
    // Placeholder - will be real Sentry.Native when installed
    nativeCrash: () => {
      throw new Error("Native crash simulation - Sentry not installed");
    },
  },
};

export default Sentry;
