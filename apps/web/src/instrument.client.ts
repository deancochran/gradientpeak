import * as Sentry from "@sentry/tanstackstart-react";
import { createBrowserSentryOptions, shouldEnableBrowserReplay } from "../sentry-config.mjs";
import {
  captureOrganizationInvitationHandoff,
  initializeBrowserInstrumentation,
} from "./lib/coaching/invitation-handoff";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

initializeBrowserInstrumentation(
  () => {
    captureOrganizationInvitationHandoff(window);
  },
  () => {
    if (!sentryDsn) return;
    const options = createBrowserSentryOptions(import.meta.env);
    const replayIntegrations = shouldEnableBrowserReplay(import.meta.env)
      ? [Sentry.replayIntegration()]
      : undefined;
    Sentry.init({
      ...options,
      ...(replayIntegrations === undefined ? {} : { integrations: replayIntegrations }),
    });
  },
);
