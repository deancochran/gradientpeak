import type { PostHogConfig } from "posthog-js";

export const posthogProjectToken =
  import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? import.meta.env.VITE_POSTHOG_KEY;

export const posthogOptions = {
  api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
  capture_pageleave: true,
  capture_pageview: "history_change",
  debug: import.meta.env.DEV && import.meta.env.VITE_POSTHOG_DEBUG === "1",
  defaults: "2026-05-30",
  loaded: (client) => {
    client.capture("web_telemetry_initialized", {
      app_surface: "web",
      environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
      source: "local-dev-or-runtime",
    });
  },
} satisfies Partial<PostHogConfig>;
