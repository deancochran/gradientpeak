import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    dataCollection: {
      // To disable sending user data and HTTP bodies, set these explicitly:
      // userInfo: false,
      // httpBodies: [],
    },
    enableLogs: true,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
  });
}
