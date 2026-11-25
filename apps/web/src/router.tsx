import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { AppProviders } from "./components/providers/app-providers";
import { createRouterContext } from "./lib/api/router-context";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = createRouterContext();
  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 200,
    defaultPendingMinMs: 200,
    defaultPendingComponent: () => (
      <p role="status" aria-live="polite" className="py-6 text-sm text-muted-foreground">
        Loading page…
      </p>
    ),
    Wrap: ({ children }) => (
      <AppProviders queryClient={context.queryClient} apiClient={context.apiClient}>
        {children}
      </AppProviders>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
    wrapQueryClient: false,
  });

  if (!router.isServer) {
    Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
