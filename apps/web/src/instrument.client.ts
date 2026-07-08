import * as Sentry from "@sentry/tanstackstart-react";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    dataCollection: {
      // To disable sending user data and HTTP bodies, set these explicitly:
      // userInfo: false,
      // httpBodies: [],
    },
    enableLogs: true,
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
    integrations: [Sentry.replayIntegration()],
    replaysOnErrorSampleRate: Number(import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 1),
    replaysSessionSampleRate: Number(
      import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0.1,
    ),
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 1),
  });
}
