import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import {
  ProviderProcessingState,
  ProviderSelectionStep,
} from "../components/onboarding/provider-onboarding";
import { RouteFlashToast, type RouteFlashType } from "../components/route-flash-toast";
import { api } from "../lib/api/client";
import { getSafeAppRedirectTarget } from "../lib/app-url";
import { authSessionMiddleware, resolveRouteAuthSession } from "../lib/auth/route-guards";
import { contractEpochFormInputProps } from "../lib/contract-epoch";
import { resolveLoadedOnboardingStatus } from "../lib/onboarding/lifecycle-load-state";
import {
  getOnboardingOAuthErrorMessage,
  parseOnboardingOAuthError,
} from "../lib/onboarding/oauth-error";
import { pollOnboardingProgress } from "../lib/onboarding/progress-poll";
import { startOnboardingProviderConnection } from "../lib/onboarding/provider-connection";
import {
  cancelPendingOnboardingOAuthAction,
  completeOnboardingIdentityAction,
  loadOnboardingOptions,
  loadOnboardingProgress,
  restartOnboardingProviderSelectionAction,
  retryOnboardingProviderAction,
} from "../lib/onboarding/server-actions";

export const Route = createFileRoute("/onboarding")({
  server: { middleware: [authSessionMiddleware] },
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: parseOnboardingOAuthError(search.error),
  }),
  beforeLoad: async ({ serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);
    if (!session?.user) {
      throw redirect({
        to: "/auth/login",
        search: { flash: undefined, flashType: undefined, redirect: "/onboarding" },
      });
    }
    if (!session.user.emailVerified) {
      throw redirect({
        to: "/auth/verify",
        search: {
          email: undefined,
          flash: undefined,
          flashType: undefined,
          source: undefined,
          redirect: "/onboarding",
        },
      });
    }
  },
  loader: async ({ location }) => {
    const options = await loadOnboardingOptions();
    if (options.profile?.onboarding_status === "completed") {
      const search = location.search as { redirect?: string };
      throw redirect({ href: getSafeAppRedirectTarget(search.redirect, "/") });
    }
    return options;
  },
  component: OnboardingPage,
});

export function OnboardingPage() {
  const initialData = Route.useLoaderData() as Awaited<ReturnType<typeof loadOnboardingOptions>>;
  const navigate = Route.useNavigate();
  const search = Route.useSearch() as {
    error?: string;
    flash?: string;
    flashType?: RouteFlashType;
    redirect?: string;
  };
  const completeOnboarding = useServerFn(completeOnboardingIdentityAction);
  const loadProgress = useServerFn(loadOnboardingProgress);
  const retryProvider = useServerFn(retryOnboardingProviderAction);
  const restartProviderSelection = useServerFn(restartOnboardingProviderSelectionAction);
  const cancelPendingOAuth = useServerFn(cancelPendingOnboardingOAuthAction);
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(() =>
    resolveLoadedOnboardingStatus({
      ...(initialData.progress?.status !== undefined
        ? { readinessStatus: initialData.progress.status }
        : {}),
      ...(initialData.profile?.onboarding_status !== undefined
        ? { profileStatus: initialData.profile.onboarding_status }
        : {}),
    }),
  );
  const [progress, setProgress] = useState(initialData.progress);
  const [progressError, setProgressError] = useState<string | null>(initialData.progressError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [pendingOAuthBlocked, setPendingOAuthBlocked] = useState(false);
  const pendingActionRef = useRef(false);
  const isBusy = isSubmitting || getAuthUrlMutation.isPending;

  useEffect(() => {
    if (status !== "processing") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await pollOnboardingProgress({
          loadProgress,
          loadReview: loadOnboardingOptions,
          shouldLoadReview: true,
        });
        if (!active) return;
        if (next.kind === "error") {
          setProgressError(next.message);
        } else if (next.kind === "review") {
          setData(next.review);
          setProgress(next.progress);
          setStatus("review");
          setProgressError(null);
          return;
        } else {
          setProgress(next.progress);
          setProgressError(null);
          if (next.progress.status !== "processing") setStatus(next.progress.status);
        }
      } catch {
        setProgressError("Preparation progress could not be refreshed. Try again.");
      } finally {
        if (active) timer = window.setTimeout(poll, 2000);
      }
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [loadProgress, status]);

  const refreshProviderState = async () => {
    try {
      const next = await loadOnboardingOptions();
      setData(next);
      if (next.progress) {
        setProgress(next.progress);
        setStatus(next.progress.status);
      }
      return true;
    } catch {
      setSubmissionError("Connected accounts could not be refreshed. You can still finish setup.");
      return false;
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setSubmissionError(null);
    setIsSubmitting(true);
    try {
      const result = await completeOnboarding({ data: new FormData(event.currentTarget) });
      if (result && "status" in result && result.status === "error") {
        setPendingOAuthBlocked("code" in result && result.code === "pending_oauth");
        setSubmissionError(result.message);
      }
    } catch {
      setSubmissionError(
        "We couldn't confirm whether setup finished. Your details are still here. Refresh this page before trying again.",
      );
    } finally {
      setIsSubmitting(false);
      pendingActionRef.current = false;
    }
  };

  const connectProvider = async (provider: (typeof data.integrations)[number]["provider"]) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setSubmissionError(null);
    try {
      await startOnboardingProviderConnection({
        provider,
        redirectUri: `${window.location.origin}/onboarding`,
        getAuthUrl: (request) => getAuthUrlMutation.mutateAsync(request),
        navigate: (url) => window.location.assign(url),
        onError: setSubmissionError,
      });
    } finally {
      pendingActionRef.current = false;
    }
  };

  const handleCancelPendingOAuth = async () => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      for (const integration of data.integrations) {
        const result = await cancelPendingOAuth({ data: { provider: integration.provider } });
        if ("status" in result && result.status === "error") {
          setSubmissionError(result.message);
          return;
        }
      }
      setPendingOAuthBlocked(false);
      await refreshProviderState();
    } finally {
      setIsSubmitting(false);
      pendingActionRef.current = false;
    }
  };

  const handleRetryProvider = async (provider: (typeof data.integrations)[number]["provider"]) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await retryProvider({ data: { provider } });
      if (result.status === "error") setSubmissionError(result.message);
      else {
        const next = await loadProgress();
        if (next.progress) setProgress(next.progress);
        setProgressError(next.error);
      }
    } finally {
      setIsSubmitting(false);
      pendingActionRef.current = false;
    }
  };

  const handleRestartProviderSelection = async () => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await restartProviderSelection();
      if ("message" in result) setSubmissionError(result.message);
      else {
        setStatus(result.status);
        setProgress(null);
        await refreshProviderState();
      }
    } finally {
      setIsSubmitting(false);
      pendingActionRef.current = false;
    }
  };

  const showIdentity = status === "provider_selection" || status === "review";
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-primary">Welcome to GradientPeak</p>
          <h1 className="text-3xl font-semibold tracking-tight">Finish your profile</h1>
          <CardDescription>
            Add your name and username. A training account is optional and can be connected later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RouteFlashToast
            {...(search.flash !== undefined ? { message: search.flash } : {})}
            {...(search.flashType !== undefined ? { type: search.flashType } : {})}
            clear={() => void navigate({ href: "/onboarding", replace: true } as never)}
          />
          {submissionError ? (
            <p
              className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              id="identity-submit-error"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}
          {search.error ? (
            <p
              className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              role="alert"
            >
              {getOnboardingOAuthErrorMessage(search.error)}
            </p>
          ) : null}

          {showIdentity ? (
            <form
              action={completeOnboardingIdentityAction.url}
              className="space-y-8"
              method="post"
              onSubmit={handleSubmit}
            >
              <input {...contractEpochFormInputProps} />
              <input name="redirect" type="hidden" value={search.redirect ?? "/"} />
              <section aria-labelledby="identity-heading" className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold" id="identity-heading">
                    Your identity
                  </h2>
                  <p className="text-sm text-muted-foreground">Both fields are required.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    autoComplete="name"
                    aria-describedby={submissionError ? "identity-submit-error" : undefined}
                    defaultValue={data.draft?.full_name}
                    id="full_name"
                    maxLength={120}
                    name="full_name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    autoCapitalize="none"
                    autoComplete="username"
                    aria-describedby={submissionError ? "identity-submit-error" : undefined}
                    defaultValue={data.draft?.username}
                    id="username"
                    maxLength={30}
                    minLength={3}
                    name="username"
                    pattern="[A-Za-z0-9_]+"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    3–30 letters, numbers, or underscores.
                  </p>
                </div>
              </section>

              {status === "provider_selection" ? (
                <section aria-labelledby="provider-heading" className="space-y-4 border-t pt-6">
                  <h2 className="sr-only" id="provider-heading">
                    Optional training account
                  </h2>
                  <ProviderSelectionStep
                    integrations={data.integrations}
                    error={data.integrationsError}
                    isBusy={isBusy}
                    onConnect={(provider) => void connectProvider(provider)}
                    onRetry={() => void refreshProviderState()}
                  />
                </section>
              ) : null}

              <div className="space-y-3 border-t pt-6">
                <Button
                  aria-busy={isBusy}
                  className="w-full sm:w-auto sm:min-w-48"
                  disabled={isBusy}
                  type="submit"
                >
                  {isBusy ? "Finishing…" : "Finish setup"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  You can set goals, preferences, metrics, and social choices after setup.
                </p>
                {pendingOAuthBlocked ? (
                  <Button
                    disabled={isBusy}
                    onClick={() => void handleCancelPendingOAuth()}
                    type="button"
                    variant="outline"
                  >
                    Cancel pending connection
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}

          {status === "processing" ? (
            <ProviderProcessingState
              error={progressError}
              isBusy={isSubmitting}
              onRecovery={(recovery) =>
                recovery.action === "retry"
                  ? void handleRetryProvider(recovery.provider)
                  : void handleRestartProviderSelection()
              }
              onRetryProgress={() =>
                void loadProgress().then((next) => {
                  if (next.progress) setProgress(next.progress);
                  setProgressError(next.error);
                })
              }
              progress={progress}
            />
          ) : null}

          {status === null ? (
            <Button onClick={() => void refreshProviderState()} type="button" variant="outline">
              Retry setup status
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
