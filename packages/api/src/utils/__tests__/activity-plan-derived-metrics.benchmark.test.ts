import { performance } from "node:perf_hooks";
import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { getActivityPlansDerivedMetrics } from "../activity-plan-derived-metrics";
import type { EstimationReadStore } from "../estimation-helpers";

const thresholds = new Map([
  [1, 5],
  [25, 25],
  [100, 100],
]);

const fixtureUuid = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function createBenchmarkPlan(index: number) {
  const durationSeconds = 1200 + index;
  const ftpPercent = 70 + (index % 10);
  const identityBase = index * 3;

  return {
    id: `plan-${index}`,
    profile_id: "profile-1",
    name: `Plan ${index}`,
    description: null,
    activity_category: "bike" as const,
    structure: {
      version: 3 as const,
      segments: [
        {
          id: fixtureUuid(identityBase + 1),
          role: "activity" as const,
          category: "bike" as const,
          name: "Benchmark ride",
          intervals: [
            {
              id: fixtureUuid(identityBase + 2),
              name: "Steady effort",
              repetitions: 1,
              steps: [
                {
                  id: fixtureUuid(identityBase + 3),
                  name: "Ride",
                  duration: { type: "time" as const, seconds: durationSeconds },
                  targets: [{ type: "%FTP" as const, intensity: ftpPercent }],
                },
              ],
            },
          ],
        },
      ],
    },
    version: "1",
    updated_at: "2026-07-12T12:00:00.000Z",
  };
}

describe("on-demand estimator CPU benchmark", () => {
  for (const [count, thresholdMs] of thresholds) {
    it(`${count} plans p95 is below ${thresholdMs}ms`, async () => {
      const plans = Array.from({ length: count }, (_, index) => createBenchmarkPlan(index));
      const store = {
        getEstimationInputs: async () => ({ profile: null, efforts: [], metrics: [], routes: [] }),
      } satisfies EstimationReadStore;
      const run = () =>
        getActivityPlansDerivedMetrics(plans, {} as DrizzleDbClient, store, "profile-1", {
          asOf: new Date("2026-07-12T12:00:00.000Z"),
        });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        // Warm JIT/module paths before collecting enough samples for a stable p95.
        for (let iteration = 0; iteration < 10; iteration++) await run();

        const samples: number[] = [];
        for (let iteration = 0; iteration < 50; iteration++) {
          const start = performance.now();
          await run();
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
        if (p95 === undefined) throw new Error("Benchmark did not collect timing samples");
        expect(errorSpy).not.toHaveBeenCalled();
        expect(p95, `p95=${p95.toFixed(2)}ms`).toBeLessThan(thresholdMs);
      } finally {
        errorSpy.mockRestore();
      }
    });
  }
});
