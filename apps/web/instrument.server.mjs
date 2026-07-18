import * as Sentry from "@sentry/tanstackstart-react";
import { createServerSentryOptions } from "./sentry-config.mjs";

if (process.env.SENTRY_DSN) {
  Sentry.init(createServerSentryOptions(process.env));
}
