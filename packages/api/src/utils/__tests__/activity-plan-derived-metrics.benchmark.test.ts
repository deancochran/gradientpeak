import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { getActivityPlansDerivedMetrics } from "../activity-plan-derived-metrics";

const thresholds = new Map([
  [1, 5],
  [25, 25],
  [100, 100],
]);

describe("on-demand estimator CPU benchmark", () => {
  for (const [count, thresholdMs] of thresholds) {
    it(`${count} plans p95 is below ${thresholdMs}ms`, async () => {
      const plans = Array.from({ length: count }, (_, index) => ({
        id: `plan-${index}`,
        profile_id: "profile-1",
        name: `Plan ${index}`,
        description: null,
        activity_category: "run" as const,
        structure: { duration: 1200 + index, intensity: 0.7 + (index % 10) / 100 },
        version: "1",
        updated_at: "2026-07-12T12:00:00.000Z",
      }));
      const store = {
        getEstimationInputs: async () => ({ profile: null, efforts: [], metrics: [], routes: [] }),
      };
      const run = () =>
        getActivityPlansDerivedMetrics(plans, {} as any, store as any, "profile-1", {
          asOf: new Date("2026-07-12T12:00:00.000Z"),
        });

      // Warm JIT/module paths before collecting enough samples for a stable p95.
      for (let iteration = 0; iteration < 10; iteration++) await run();

      const samples: number[] = [];
      for (let iteration = 0; iteration < 50; iteration++) {
        const start = performance.now();
        await run();
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
      expect(p95, `p95=${p95.toFixed(2)}ms`).toBeLessThan(thresholdMs);
    });
  }
});
