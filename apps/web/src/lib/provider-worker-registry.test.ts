import { describe, expect, it, vi } from "vitest";

vi.mock("./strava-sync-worker", () => ({ drainStravaProviderSync: async () => ({}) }));
vi.mock("./wahoo-sync-worker", () => ({ drainWahooProviderSync: async () => ({}) }));

import {
  certifyProviderWorkerRegistry,
  createProviderWorkerRegistry,
  providerWorkerRegistry,
} from "./provider-worker-registry";

describe("provider worker registry", () => {
  it("only reports workers declared by each connector manifest", () => {
    const registry = createProviderWorkerRegistry([
      {
        provider: "strava",
        worker: "strava-provider-sync",
        operations: [
          "activity_history_reconcile",
          "completed_activity_export",
          "webhook_activity_updates",
        ],
        value: "history",
      },
    ]);

    expect(registry.available("strava")).toEqual([
      { operation: "activity_history_reconcile", worker: "strava-provider-sync" },
      { operation: "completed_activity_export", worker: "strava-provider-sync" },
      { operation: "webhook_activity_updates", worker: "strava-provider-sync" },
    ]);
    expect(registry.get("strava", "strava-provider-sync")).toBe("history");
    expect(registry.get("strava", "undeclared")).toBeNull();
  });

  it("certifies every manifest worker against real app-owned registrations", () => {
    expect(() => certifyProviderWorkerRegistry(providerWorkerRegistry)).not.toThrow();
    expect(() => certifyProviderWorkerRegistry(createProviderWorkerRegistry([]))).toThrow(
      /worker registration missing/i,
    );
    expect(() =>
      certifyProviderWorkerRegistry(
        createProviderWorkerRegistry(
          providerWorkerRegistry.registrations().map((registration) =>
            registration.provider === "strava"
              ? {
                  ...registration,
                  operations: [...registration.operations, "disconnect" as const],
                }
              : registration,
          ),
        ),
      ),
    ).toThrow(/operation is undeclared/i);
    expect(() =>
      createProviderWorkerRegistry([
        {
          provider: "strava",
          worker: "strava-provider-sync",
          operations: ["activity_history_reconcile"],
          value: async () => ({}),
        },
        {
          provider: "strava",
          worker: "strava-provider-sync",
          operations: ["completed_activity_export"],
          value: async () => ({}),
        },
      ]),
    ).toThrow(/duplicate provider worker/i);
    expect(() =>
      createProviderWorkerRegistry([
        {
          provider: "strava",
          worker: "empty",
          operations: [],
          value: async () => ({}),
        },
      ]),
    ).toThrow(/has no operations/i);
  });
});
