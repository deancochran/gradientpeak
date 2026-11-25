import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { ExecutableIntegrationProviderId } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { ProgressBar } from "@repo/ui/components/progress";

export type ProviderCatalogItem<TProvider extends string = ExecutableIntegrationProviderId> = {
  configured: boolean;
  connected: boolean;
  label: string;
  onboarding: {
    summary: string;
    evidence: { activityHistory: boolean; profileDetails: boolean };
  };
  primaryAction: "connect" | "disconnect" | "reconnect" | null;
  provider: TProvider;
  providerHealth: { status: string; lastError: string | null };
  activityHistory: {
    status: string;
    importRun: {
      importedCount: number;
      skippedCount: number;
      failedCount: number;
    } | null;
  };
};

type OnboardingProgress = inferRouterOutputs<AppRouter>["onboarding"]["getProgress"];

function safeProviderError<TProvider extends string>(provider: ProviderCatalogItem<TProvider>) {
  if (provider.providerHealth.status === "needs_reconnect") {
    return "This account needs to be reconnected before it can sync.";
  }
  return provider.providerHealth.lastError ? "This connection needs attention." : null;
}

export function ProviderSelectionStep<TProvider extends string>({
  integrations,
  error,
  isBusy,
  onConnect,
  onRetry,
}: {
  integrations: ProviderCatalogItem<TProvider>[];
  error?: string | null;
  isBusy: boolean;
  onConnect: (provider: TProvider) => void;
  onRetry?: () => void;
}) {
  return (
    <section aria-labelledby="provider-selection-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight" id="provider-selection-heading">
          Connect your accounts
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect a training account to import only the information that provider supports.
          Connecting is optional, and you control which accounts remain connected.
        </p>
      </div>
      {error ? (
        <div className="space-y-3 rounded-md border border-destructive/40 p-4" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button disabled={isBusy} onClick={onRetry} type="button" variant="outline">
              Retry loading accounts
            </Button>
          ) : null}
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Available training accounts">
        {integrations.map((provider) => {
          const reconnect = provider.primaryAction === "reconnect";
          const canConnect = provider.configured && (!provider.connected || reconnect);
          const error = safeProviderError(provider);
          return (
            <li className="space-y-3 rounded-md border p-4" key={provider.provider}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{provider.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {provider.onboarding.summary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {provider.onboarding.evidence.activityHistory
                      ? "Can import activity history."
                      : "Does not import activity history."}{" "}
                    {provider.onboarding.evidence.profileDetails
                      ? "Can use profile details."
                      : "Does not use profile details."}
                  </p>
                </div>
                {provider.connected && !reconnect ? (
                  <span className="whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium">
                    ✓ Connected
                  </span>
                ) : null}
              </div>
              {!provider.configured ? (
                <p className="text-sm text-muted-foreground">Unavailable on this server</p>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {canConnect ? (
                <Button
                  aria-busy={isBusy}
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => onConnect(provider.provider)}
                  type="button"
                  variant={reconnect ? "outline" : "default"}
                >
                  {reconnect ? "Reconnect" : "Connect"}
                </Button>
              ) : provider.connected ? (
                <Button className="w-full" disabled type="button" variant="outline">
                  Connected
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!error && integrations.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          No training account providers are available right now. You can continue and add one later.
        </p>
      ) : null}
    </section>
  );
}

const providerStateCopy = {
  waiting: "Waiting",
  working: "Working",
  complete: "Complete",
  needs_attention: "Needs attention",
} as const;

export function ProviderProcessingStep({
  progress,
  isBusy,
  onRecovery,
}: {
  progress: OnboardingProgress;
  isBusy: boolean;
  onRecovery: (recovery: NonNullable<OnboardingProgress["recovery"]>) => void;
}) {
  return (
    <section aria-labelledby="provider-processing-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight" id="provider-processing-heading">
          Preparing your starting point
        </h2>
      </div>
      <p aria-live="polite" className="sr-only">
        {`${progress.phase}: ${progress.message}`}
      </p>
      <div className="space-y-3">
        <p className="font-medium">{progress.message}</p>
        <div className="flex items-center gap-3">
          <ProgressBar
            accessibilityLabel="Onboarding preparation progress"
            value={progress.percent}
          />
          <span className="min-w-12 text-right text-sm font-semibold">{progress.percent}%</span>
        </div>
        {progress.detail ? (
          <p className="text-sm text-muted-foreground">{progress.detail}</p>
        ) : null}
      </div>
      {progress.provider_summary.length > 1 || progress.recovery ? (
        <ul className="flex flex-wrap gap-2" aria-label="Connected account preparation statuses">
          {progress.provider_summary.map((provider) => (
            <li className="rounded-full border px-2.5 py-1 text-xs" key={provider.provider}>
              {provider.label}: {providerStateCopy[provider.state]}
            </li>
          ))}
        </ul>
      ) : null}
      {progress.recovery ? (
        <div className="space-y-3 rounded-md border border-destructive/40 p-4">
          <p className="text-sm">{progress.recovery.message}</p>
          <Button
            disabled={isBusy}
            onClick={() => progress.recovery && onRecovery(progress.recovery)}
            type="button"
            variant="outline"
          >
            {progress.recovery.action === "retry"
              ? `Retry ${progress.recovery.label}`
              : "Return to account selection"}
          </Button>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        It’s safe to leave and return while this work continues in the background.
      </p>
    </section>
  );
}

export function ProviderProcessingState({
  error,
  progress,
  isBusy,
  onRecovery,
  onRetryProgress,
}: {
  error: string | null;
  progress: OnboardingProgress | null;
  isBusy: boolean;
  onRecovery: (recovery: NonNullable<OnboardingProgress["recovery"]>) => void;
  onRetryProgress: () => void;
}) {
  return (
    <div className="space-y-6">
      {error ? (
        <div className="space-y-3 rounded-md border border-destructive/40 p-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <Button disabled={isBusy} onClick={onRetryProgress} type="button" variant="outline">
            Retry progress
          </Button>
        </div>
      ) : null}
      {progress ? (
        <ProviderProcessingStep isBusy={isBusy} onRecovery={onRecovery} progress={progress} />
      ) : !error ? (
        <div className="space-y-3" role="status">
          <h2 className="text-3xl font-semibold tracking-tight">Loading preparation progress</h2>
          <p className="text-sm text-muted-foreground">
            Checking the latest saved preparation milestone.
          </p>
        </div>
      ) : null}
    </div>
  );
}
