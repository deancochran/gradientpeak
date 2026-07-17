import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Toaster } from "@repo/ui/components/sonner";
import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import { AppProviders } from "../components/providers/app-providers";

import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GradientPeak" },
      { name: "application-name", content: "GradientPeak" },
      { name: "apple-mobile-web-app-title", content: "GradientPeak" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#020617" },
      {
        name: "description",
        content: "GradientPeak training, activity logging, planning, and athlete intelligence.",
      },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/logo192.png" },
    ],
  }),
  shellComponent: RootDocument,
  pendingComponent: RootPendingPage,
  errorComponent: RootErrorPage,
  notFoundComponent: RootNotFoundPage,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <AppProviders>
          <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-12 pt-8 sm:px-6 lg:px-8 has-[>.gp-protected-shell]:max-w-none has-[>.gp-protected-shell]:px-0 has-[>.gp-protected-shell]:pb-0 has-[>.gp-protected-shell]:pt-0">
            {children}
          </div>
          <Toaster richColors position="top-right" />
          <DevelopmentTools />
        </AppProviders>
        <Scripts />
      </body>
    </html>
  );
}

function DevelopmentTools() {
  if (!import.meta.env.DEV) return null;

  return (
    <TanStackDevtools
      config={{
        position: "bottom-right",
      }}
      plugins={[
        {
          name: "TanStack Router",
          render: <TanStackRouterDevtoolsPanel />,
        },
      ]}
    />
  );
}

export function RootPendingPage() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center py-8"
      role="status"
      aria-live="polite"
    >
      <Card className="w-full max-w-lg overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl">Loading GradientPeak</CardTitle>
          <CardDescription>Preparing your training workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}

export function RootErrorPage({ reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">We could not load this page</CardTitle>
          <CardDescription>
            Something unexpected interrupted the request. Your account and training data are safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function RootNotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8 text-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            404
          </p>
          <CardTitle className="text-3xl tracking-tight">Page not found</CardTitle>
          <CardDescription className="text-base">
            The page you requested does not exist or may have moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/">Go to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/search" search={{ q: undefined }}>
              Search GradientPeak
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
