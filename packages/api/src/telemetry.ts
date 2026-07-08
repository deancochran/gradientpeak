import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

let serverTelemetryInitialized = false;
let posthogClient: PostHog | null = null;

function readSampleRate(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function initServerTelemetry() {
  if (serverTelemetryInitialized) {
    return;
  }

  serverTelemetryInitialized = true;

  const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  const sentryDsn = process.env.SENTRY_DSN;

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 1),
    });
  }

  const posthogKey = process.env.POSTHOG_KEY;
  if (posthogKey) {
    posthogClient = new PostHog(posthogKey, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      secretKey: process.env.POSTHOG_SECRET_KEY ?? process.env.POSTHOG_PERSONAL_API_KEY,
    });

    posthogClient.capture({
      distinctId: "gradientpeak-server",
      event: "server_telemetry_initialized",
      properties: {
        app_surface: "api",
        environment,
        source: "local-dev-or-runtime",
      },
    });
  }
}

export function captureApiError(error: unknown, context?: Record<string, unknown>) {
  initServerTelemetry();

  Sentry.captureException(error, { extra: context });

  posthogClient?.capture({
    distinctId: typeof context?.userId === "string" ? context.userId : "gradientpeak-server",
    event: "api_error",
    properties: {
      ...context,
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

export function captureApiEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId = "gradientpeak-server",
) {
  initServerTelemetry();

  posthogClient?.capture({
    distinctId,
    event,
    properties,
  });
}

export function getPostHogClient() {
  initServerTelemetry();
  return posthogClient;
}

export { Sentry };
