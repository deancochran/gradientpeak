import {
  type ExecutableIntegrationProviderId,
  getProviderWorkerRequirements,
  type ProviderOperationToken,
  providerManifestRegistry,
} from "@repo/core";
import { drainStravaProviderSync } from "./strava-sync-worker";
import { drainWahooProviderSync } from "./wahoo-sync-worker";

export type ProviderWorkerRegistration<TWorker> = {
  provider: ExecutableIntegrationProviderId;
  worker: string;
  operations: readonly ProviderOperationToken[];
  value: TWorker;
};

/**
 * Derives worker availability from the Core manifest while allowing app-owned workers
 * to remain thin wrappers around their existing runtimes.
 */
export function createProviderWorkerRegistry<TWorker>(
  registrations: readonly ProviderWorkerRegistration<TWorker>[],
) {
  const registered = new Map<string, ProviderWorkerRegistration<TWorker>>();
  const bindings = new Map<string, ProviderWorkerRegistration<TWorker>>();
  for (const entry of registrations) {
    const workerKey = `${entry.provider}:${entry.worker}`;
    if (registered.has(workerKey)) throw new Error(`Duplicate provider worker: ${workerKey}`);
    if (entry.operations.length === 0) {
      throw new Error(`Provider worker has no operations: ${workerKey}`);
    }
    registered.set(workerKey, entry);
    for (const operation of entry.operations) {
      const operationKey = `${entry.provider}:${operation}:${entry.worker}`;
      if (bindings.has(operationKey))
        throw new Error(`Duplicate provider worker operation: ${operationKey}`);
      bindings.set(operationKey, entry);
    }
  }
  return {
    available(provider: ExecutableIntegrationProviderId) {
      return getProviderWorkerRequirements(provider).filter((requirement) =>
        registered
          .get(`${provider}:${requirement.worker}`)
          ?.operations.includes(requirement.operation),
      );
    },
    get(provider: ExecutableIntegrationProviderId, worker: string): TWorker | null {
      if (
        !getProviderWorkerRequirements(provider).some(
          (requirement) => requirement.worker === worker,
        )
      ) {
        return null;
      }
      return registered.get(`${provider}:${worker}`)?.value ?? null;
    },
    registrations: () => Array.from(registered.values()),
  };
}

export function certifyProviderWorkerRegistry<TWorker>(
  registry: ReturnType<typeof createProviderWorkerRegistry<TWorker>>,
): void {
  const expected = new Set<string>();
  for (const manifest of providerManifestRegistry) {
    for (const requirement of manifest.workerRequirements) {
      const key = `${manifest.connectorId}:${requirement.operation}:${requirement.worker}`;
      expected.add(key);
      const registration = registry
        .registrations()
        .find(
          (entry) => entry.provider === manifest.connectorId && entry.worker === requirement.worker,
        );
      if (!registration) {
        throw new Error(
          `Provider worker registration missing: ${manifest.connectorId}/${requirement.worker}`,
        );
      }
      if (!registration.operations.includes(requirement.operation)) {
        throw new Error(`Provider worker operation missing: ${key}`);
      }
    }
  }
  for (const registration of registry.registrations()) {
    for (const operation of registration.operations) {
      const key = `${registration.provider}:${operation}:${registration.worker}`;
      if (!expected.delete(key)) throw new Error(`Provider worker operation is undeclared: ${key}`);
    }
  }
  if (expected.size) throw new Error("Provider worker registry has missing bindings");
}

/** Actual app-owned drain functions, bound to manifest requirements at startup. */
export const providerWorkerRegistry = createProviderWorkerRegistry<() => Promise<unknown>>([
  {
    provider: "wahoo",
    worker: "wahoo-provider-sync",
    operations: ["activity_history_reconcile", "planned_activity_push", "webhook_activity_updates"],
    value: drainWahooProviderSync,
  },
  {
    provider: "strava",
    worker: "strava-provider-sync",
    operations: [
      "activity_history_reconcile",
      "completed_activity_export",
      "webhook_activity_updates",
    ],
    value: drainStravaProviderSync,
  },
]);

certifyProviderWorkerRegistry(providerWorkerRegistry);
