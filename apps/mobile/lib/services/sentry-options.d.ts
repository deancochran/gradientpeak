export interface MobileSentryEnvironment {
  EXPO_PUBLIC_ENABLE_SENTRY_IN_DEV?: string | undefined;
  EXPO_PUBLIC_ENABLE_SENTRY_REPLAY?: string | undefined;
  EXPO_PUBLIC_SENTRY_DSN?: string | undefined;
  EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE?: string | undefined;
  EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE?: string | undefined;
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?: string | undefined;
  [key: string]: string | undefined;
}

export interface MobileSentryOptions extends Record<string, unknown> {
  dsn?: string;
  enableAutoPerformanceTracing: boolean;
  enableLogs: false;
  environment: string;
  replaysOnErrorSampleRate: number;
  replaysSessionSampleRate: number;
  sendDefaultPii: false;
  tracesSampleRate: number;
}

export function readSampleRate(value: unknown, fallback?: number): number;
export function shouldEnableReplay(env: MobileSentryEnvironment): boolean;
export function shouldEnableSentry(
  env: MobileSentryEnvironment,
  isDevelopment: boolean,
  dsn?: string,
): boolean;
export function createMobileSentryOptions(
  env: MobileSentryEnvironment,
  environment: string,
): MobileSentryOptions;
