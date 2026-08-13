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
import { retainSnapshotOnRefresh } from "../lib/onboarding/manual-refresh";
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
  saveOnboardingDraftAction,
  startOnboardingProcessingAction,
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
        search: { email: undefined, flash: undefined, flashType: undefined, source: undefined },
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

const intents = [
  ["train_event", "Train for an event"],
  ["improve_fitness", "Improve fitness"],
  ["track_activities", "Track activities"],
  ["groups", "Train with groups"],
  ["follow_people", "Follow athletes"],
  ["coach_group", "Coach or manage"],
  ["explore", "Just exploring"],
] as const;
function SourceSelect({ field, defaultValue }: { field: string; defaultValue?: string }) {
  return (
    <select
      aria-label={`${field} source`}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      defaultValue={defaultValue ?? "manual"}
      name={`${field}_source`}
    >
      <option value="manual">Entered manually</option>
      <option value="estimated">Estimated</option>
      <option value="imported">Imported from provider</option>
    </select>
  );
}

function BaselineField({
  field,
  label,
  defaultValue,
  source,
  type = "number",
  min,
  max,
  step,
}: {
  field: string;
  label: string;
  defaultValue?: string | number;
  source?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor={field}>{label}</Label>
        <Input
          defaultValue={defaultValue}
          id={field}
          max={max}
          min={min}
          name={field}
          step={step}
          type={type}
        />
      </div>
      <SourceSelect {...(source ? { defaultValue: "imported" } : {})} field={field} />
      {source ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">Imported from {source}</p>
      ) : null}
    </div>
  );
}

function CheckboxChoice({
  name,
  value,
  label,
  description,
  defaultChecked = false,
}: {
  name: string;
  value: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 rounded-md border p-3">
      <input
        className="mt-1 size-4"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
        value={value}
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="block text-sm text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function OnboardingPage() {
  const initialData = Route.useLoaderData() as Awaited<ReturnType<typeof loadOnboardingOptions>>;
  const [data, setData] = useState(initialData);
  const navigate = Route.useNavigate();
  const completeOnboarding = useServerFn(completeOnboardingIdentityAction);
  const saveDraft = useServerFn(saveOnboardingDraftAction);
  const startProcessing = useServerFn(startOnboardingProcessingAction);
  const retryProvider = useServerFn(retryOnboardingProviderAction);
  const restartProviderSelection = useServerFn(restartOnboardingProviderSelectionAction);
  const loadProgress = useServerFn(loadOnboardingProgress);
  const cancelPendingOAuth = useServerFn(cancelPendingOnboardingOAuthAction);
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();
  const [status, setStatus] = useState(() =>
    resolveLoadedOnboardingStatus({
      readinessStatus: data.progress?.status,
      profileStatus: data.profile?.onboarding_status,
    }),
  );
  const [progress, setProgress] = useState(data.progress);
  const [progressError, setProgressError] = useState<string | null>(data.progressError);
  const [setupStatusError, setSetupStatusError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState(data.integrations);
  const [integrationsError, setIntegrationsError] = useState(data.integrationsError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [pendingOAuthBlocked, setPendingOAuthBlocked] = useState(false);
  const reviewHydrationStartedRef = useRef(false);
  const {
    error: oauthError,
    flash,
    flashType,
    redirect: redirectTo,
  } = Route.useSearch() as {
    error?: string;
    flash?: string;
    flashType?: RouteFlashType;
    redirect?: string;
  };
  const setupData = data.setupData;
  const draft = data.draft;
  const importedSource = (field: keyof NonNullable<typeof setupData>["sources"]) =>
    setupData?.sources[field]?.label;
  const dobSource = importedSource("dob");
  const genderSource = importedSource("gender");
  const weightSource = importedSource("weight_kg");

  useEffect(() => {
    if (status !== "processing") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await pollOnboardingProgress({
          loadProgress,
          loadReview: loadOnboardingOptions,
          shouldLoadReview: !reviewHydrationStartedRef.current,
        });
        if (!active) return;
        if (next.kind === "error") {
          setProgressError(next.message);
        } else {
          setProgress(next.progress);
          setProgressError(null);
          if (next.kind === "review") {
            reviewHydrationStartedRef.current = true;
            setData(next.review);
            setStatus("review");
            return;
          }
          const nextStatus = next.progress.status;
          if (nextStatus && nextStatus !== "processing") setStatus(nextStatus);
        }
      } catch {
        setProgressError(
          "Preparation progress could not be refreshed. Your work is still saved; try again.",
        );
      } finally {
        if (active) timer = window.setTimeout(poll, 2000);
      }
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [status, loadProgress]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmissionError(null);
    setIsSubmitting(true);
    try {
      const result = await completeOnboarding({ data: new FormData(event.currentTarget) });
      if ("status" in result && result.status === "error") setSubmissionError(result.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError(null);
    setIsSubmitting(true);
    try {
      const result = await saveDraft({ data: new FormData(event.currentTarget) });
      if ("status" in result && result.status === "error") setSubmissionError(result.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartProcessing = async () => {
    setSubmissionError(null);
    setIsSubmitting(true);
    try {
      const result = await startProcessing();
      if ("status" in result && result.status === "error") {
        setPendingOAuthBlocked(result.code === "pending_oauth");
        setSubmissionError(
          result.code === "pending_oauth"
            ? "A provider connection is still pending. Finish it, or explicitly cancel it before continuing."
            : result.message,
        );
        return;
      }
      setStatus(result.status);
      if (result.status === "processing") {
        const next = await loadProgress();
        if (next.progress) setProgress(next.progress);
        setProgressError(next.error);
      } else {
        await refreshProviderState();
      }
    } catch {
      setSubmissionError("Processing could not be started. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartProviderSelection = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await restartProviderSelection();
      if ("message" in result) setSubmissionError(result.message);
      else {
        setStatus(result.status);
        setProgress(null);
        const refreshed = await refreshProviderState();
        if (!refreshed) {
          setSetupStatusError(
            "Account selection reopened, but connected accounts could not be refreshed. Try again.",
          );
        }
      }
    } catch {
      setSubmissionError("Account selection could not be reopened. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPendingOAuth = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      for (const integration of integrations) {
        const result = await cancelPendingOAuth({ data: { provider: integration.provider } });
        if ("status" in result && result.status === "error") {
          setSubmissionError(result.message);
          return;
        }
      }
      setPendingOAuthBlocked(false);
      await refreshProviderState();
    } catch {
      setSubmissionError("The pending connection could not be cancelled. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshProviderState = async () => {
    try {
      const next = await loadOnboardingOptions();
      setData(next);
      setProgressError(next.progressError);
      setSetupStatusError(null);
      if (!next.integrationsError) setIntegrations(next.integrations);
      setIntegrationsError(next.integrationsError);
      if (next.progress) {
        setProgress(next.progress);
        setStatus(next.progress.status);
      } else {
        const nextStatus = resolveLoadedOnboardingStatus({
          readinessStatus: null,
          profileStatus: next.profile?.onboarding_status,
        });
        if (nextStatus) setStatus(nextStatus);
      }
      return true;
    } catch {
      setSetupStatusError("Setup status could not be refreshed. Your saved setup was retained.");
      return false;
    }
  };

  const refreshProgress = async () => {
    await retainSnapshotOnRefresh({
      load: loadProgress,
      onSuccess: (next) => {
        if (next.progress) {
          setProgress(next.progress);
          setStatus(next.progress.status);
          setProgressError(null);
        } else {
          setProgressError(next.error);
        }
      },
      onError: setProgressError,
      errorMessage:
        "Preparation progress could not be refreshed. Your last saved progress is still shown.",
    });
  };

  const handleRetryProvider = async (provider: (typeof integrations)[number]["provider"]) => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await retryProvider({ data: { provider } });
      if (result.status === "error") setSubmissionError(result.message);
      else await refreshProgress();
    } catch {
      setSubmissionError("Preparation could not be retried. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const connectProvider = async (provider: (typeof integrations)[number]["provider"]) => {
    const redirectUri = `${window.location.origin}/onboarding`;
    setSubmissionError(null);
    await startOnboardingProviderConnection({
      provider,
      redirectUri,
      getAuthUrl: (request) => getAuthUrlMutation.mutateAsync(request),
      navigate: (url) => window.location.assign(url),
      onError: setSubmissionError,
    });
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <Card className="w-full overflow-hidden">
        {status === "review" ? (
          <CardHeader>
            <p className="text-sm font-medium text-primary">Welcome to GradientPeak</p>
            <h1 className="text-3xl font-semibold tracking-tight">Review your setup</h1>
            <CardDescription>
              Your starting point is ready. Review your answers before finalizing setup.
            </CardDescription>
          </CardHeader>
        ) : null}
        <CardContent>
          <RouteFlashToast
            {...(flash !== undefined ? { message: flash } : {})}
            {...(flashType !== undefined ? { type: flashType } : {})}
            clear={() =>
              void navigate({
                href: redirectTo
                  ? `/onboarding?redirect=${encodeURIComponent(redirectTo)}`
                  : "/onboarding",
                replace: true,
              } as never)
            }
          />
          {submissionError ? (
            <p
              className="mb-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}
          {oauthError ? (
            <p
              className="mb-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              role="alert"
            >
              {getOnboardingOAuthErrorMessage(oauthError)}
            </p>
          ) : null}

          {setupStatusError ? (
            <p
              className="mb-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              role="alert"
            >
              {setupStatusError}
            </p>
          ) : null}

          {progressError && status !== "provider_selection" && status !== "processing" ? (
            <div
              className="mb-6 space-y-3 rounded-md border border-destructive/40 p-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{progressError}</p>
              <Button onClick={() => void refreshProgress()} type="button" variant="outline">
                Retry progress
              </Button>
            </div>
          ) : null}

          {status === null ? (
            <div className="space-y-3" role="status">
              <h1 className="text-3xl font-semibold tracking-tight">Loading your setup</h1>
              <p className="text-sm text-muted-foreground">
                We couldn’t confirm your current setup stage yet. Retry without changing your
                connected accounts.
              </p>
              <Button onClick={() => void refreshProviderState()} type="button" variant="outline">
                Retry setup status
              </Button>
            </div>
          ) : null}

          {status === "provider_selection" ? (
            <div className="space-y-6">
              <ProviderSelectionStep
                integrations={integrations}
                error={integrationsError}
                isBusy={isSubmitting || getAuthUrlMutation.isPending}
                onConnect={(provider) => void connectProvider(provider)}
                onRetry={() => void refreshProviderState()}
              />
              <div className="space-y-2 border-t pt-5">
                <Button
                  className="w-full sm:w-auto"
                  disabled={isSubmitting}
                  onClick={() => void handleStartProcessing()}
                  type="button"
                >
                  Continue
                </Button>
                <p className="text-sm text-muted-foreground">
                  You can add or manage accounts later.
                </p>
                {pendingOAuthBlocked ? (
                  <Button
                    disabled={isSubmitting}
                    onClick={() => void handleCancelPendingOAuth()}
                    type="button"
                    variant="outline"
                  >
                    Cancel pending connection
                  </Button>
                ) : null}
              </div>
            </div>
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
              onRetryProgress={() => void refreshProgress()}
              progress={progress}
            />
          ) : null}

          {status === "review" ? (
            <form
              action={completeOnboardingIdentityAction.url}
              className="space-y-10"
              method="post"
              onSubmit={status === "review" ? handleSubmit : handleDraft}
            >
              <input {...contractEpochFormInputProps} />
              <input name="redirect" type="hidden" value={redirectTo ?? "/"} />
              <section aria-labelledby="identity-heading" className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold" id="identity-heading">
                    Profile and intent
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Identity is required. Personalization choices are optional.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full name</Label>
                    <Input
                      autoComplete="name"
                      defaultValue={draft?.full_name}
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
                      defaultValue={draft?.username}
                      id="username"
                      maxLength={50}
                      name="username"
                      pattern="[A-Za-z0-9_]+"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience_level">Experience level</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="skip"
                    id="experience_level"
                    name="experience_level"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="skip">Set up later</option>
                  </select>
                </div>
                <fieldset className="space-y-3">
                  <legend className="font-medium">What brings you here?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {intents.map(([value, label]) => (
                      <CheckboxChoice
                        defaultChecked={draft?.intents.includes(value)}
                        key={value}
                        label={label}
                        name="intents"
                        value={value}
                      />
                    ))}
                  </div>
                </fieldset>
              </section>

              <section aria-labelledby="baseline-heading" className="space-y-5 border-t pt-8">
                <div>
                  <h2 className="text-xl font-semibold" id="baseline-heading">
                    Training baseline
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Imported values retain provenance. Every baseline field is optional.
                  </p>
                </div>
                <BaselineField
                  {...(setupData?.values.dob !== undefined
                    ? { defaultValue: draft?.dob ?? setupData.values.dob }
                    : draft?.dob
                      ? { defaultValue: draft.dob }
                      : {})}
                  field="dob"
                  label="Date of birth"
                  {...(dobSource !== undefined ? { source: dobSource } : {})}
                  type="date"
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={draft?.gender ?? setupData?.values.gender ?? ""}
                      id="gender"
                      name="gender"
                    >
                      <option value="">Not set</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <SourceSelect
                    {...(genderSource ? { defaultValue: "imported" } : {})}
                    field="gender"
                  />
                </div>
                <BaselineField
                  {...(setupData?.values.weight_kg !== undefined
                    ? { defaultValue: draft?.weight_kg ?? setupData.values.weight_kg }
                    : draft?.weight_kg !== undefined
                      ? { defaultValue: draft.weight_kg }
                      : {})}
                  field="weight_kg"
                  label="Weight (kg)"
                  max={300}
                  min={30}
                  {...(weightSource !== undefined ? { source: weightSource } : {})}
                  step="0.1"
                />
                <BaselineField
                  defaultValue={draft?.max_hr}
                  field="max_hr"
                  label="Maximum heart rate (bpm)"
                  max={250}
                  min={100}
                />
                <BaselineField
                  defaultValue={draft?.resting_hr}
                  field="resting_hr"
                  label="Resting heart rate (bpm)"
                  max={120}
                  min={30}
                />
              </section>

              <section aria-labelledby="preferences-heading" className="space-y-5 border-t pt-8">
                <div>
                  <h2 className="text-xl font-semibold" id="preferences-heading">
                    Training preferences
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Choose a starting approach and weekly dose.
                  </p>
                </div>
                <CheckboxChoice
                  defaultChecked={Boolean(draft?.settings)}
                  label="Save these preferences"
                  name="save_preferences"
                  value="on"
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="preference_preset">Progression approach</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={draft?.settings?.preset ?? "balanced"}
                      id="preference_preset"
                      name="preference_preset"
                    >
                      <option value="safer">Safer</option>
                      <option value="balanced">Balanced</option>
                      <option value="push_harder">Push harder</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min_sessions_per_week">Minimum sessions/week</Label>
                    <Input
                      defaultValue={draft?.settings?.minSessionsPerWeek ?? 3}
                      id="min_sessions_per_week"
                      max={21}
                      min={0}
                      name="min_sessions_per_week"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_sessions_per_week">Maximum sessions/week</Label>
                    <Input
                      defaultValue={draft?.settings?.maxSessionsPerWeek ?? 5}
                      id="max_sessions_per_week"
                      max={21}
                      min={0}
                      name="max_sessions_per_week"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_single_session_minutes">Maximum session minutes</Label>
                    <Input
                      defaultValue={draft?.settings?.maxSingleSessionMinutes ?? 90}
                      id="max_single_session_minutes"
                      max={600}
                      min={20}
                      name="max_single_session_minutes"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_weekly_minutes">Maximum weekly minutes</Label>
                    <Input
                      defaultValue={draft?.settings?.maxWeeklyMinutes ?? 360}
                      id="max_weekly_minutes"
                      max={10080}
                      min={30}
                      name="max_weekly_minutes"
                      type="number"
                    />
                  </div>
                </div>
              </section>

              <section aria-labelledby="goal-heading" className="space-y-5 border-t pt-8">
                <div>
                  <h2 className="text-xl font-semibold" id="goal-heading">
                    Initial goal (required to finalize)
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Add a plan-ready goal before finalizing. You can leave it blank while saving a
                    draft.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="goal_title">Goal title</Label>
                    <Input
                      defaultValue={draft?.goal?.title}
                      id="goal_title"
                      maxLength={100}
                      name="goal_title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal_target_date">Target date</Label>
                    <Input
                      defaultValue={draft?.goal?.target_date}
                      id="goal_target_date"
                      name="goal_target_date"
                      type="date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal_activity_category">Activity</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={draft?.goal?.activity_category ?? "run"}
                      id="goal_activity_category"
                      name="goal_activity_category"
                    >
                      <option value="bike">Cycling</option>
                      <option value="run">Running</option>
                      <option value="swim">Swimming</option>
                      <option value="strength">Strength</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal_target_sessions_per_week">Sessions/week</Label>
                    <Input
                      defaultValue={draft?.goal?.target_sessions_per_week ?? 3}
                      id="goal_target_sessions_per_week"
                      max={21}
                      min={1}
                      name="goal_target_sessions_per_week"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal_target_weeks">Duration (weeks)</Label>
                    <Input
                      defaultValue={draft?.goal?.target_weeks ?? 12}
                      id="goal_target_weeks"
                      max={260}
                      min={1}
                      name="goal_target_weeks"
                      type="number"
                    />
                  </div>
                </div>
              </section>

              <section aria-labelledby="community-heading" className="space-y-5 border-t pt-8">
                <div>
                  <h2 className="text-xl font-semibold" id="community-heading">
                    Groups and people
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Nothing is sent until you finish setup.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <fieldset className="space-y-3">
                    <legend className="font-medium">Invitations</legend>
                    {data.invitations.length ? (
                      data.invitations.map((item) => (
                        <CheckboxChoice
                          key={item.id}
                          label={item.name}
                          name="invitation_ids"
                          value={item.id}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No pending invitations.</p>
                    )}
                  </fieldset>
                  <fieldset className="space-y-3">
                    <legend className="font-medium">Groups</legend>
                    {data.groups.length ? (
                      data.groups.map((item) => (
                        <CheckboxChoice
                          description={item.action}
                          key={item.id}
                          label={item.name}
                          name="group_ids"
                          value={item.id}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No group suggestions.</p>
                    )}
                  </fieldset>
                  <fieldset className="space-y-3">
                    <legend className="font-medium">People</legend>
                    {data.people.length ? (
                      data.people.map((item) => (
                        <CheckboxChoice
                          description={`@${item.username}`}
                          key={item.id}
                          label={item.name}
                          name="follow_profile_ids"
                          value={item.id}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No people suggestions.</p>
                    )}
                  </fieldset>
                </div>
              </section>

              <Button
                aria-busy={isSubmitting}
                className="w-full sm:w-auto sm:min-w-48"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Saving…" : status === "review" ? "Finalize setup" : "Save draft"}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
