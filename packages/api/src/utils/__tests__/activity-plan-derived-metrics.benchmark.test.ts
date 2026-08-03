import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { createTestPerformanceModelRepository } from "../../test-support/performance-model";
import { getActivityPlansDerivedMetrics } from "../activity-plan-derived-metrics";
import type { EstimationReadStore } from "../estimation-helpers";

const thresholds = new Map([
  [1, 5],
  [25, 25],
  [100, 100],
]);
const BENCHMARK_TIMEOUT_MS = 15_000;
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const benchmark = process.env.RUN_ACTIVITY_PLAN_DERIVED_METRICS_BENCHMARK === "1" ? it : it.skip;

const fixtureUuid = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function createBenchmarkPlan(index: number) {
  const durationSeconds = 1200 + index;
  const ftpPercent = 70 + (index % 10);
  const identityBase = index * 3;

  const structure = {
    version: 3 as const,
    segments: [
      {
        id: fixtureUuid(identityBase + 1),
        role: "activity" as const,
        activity_category: "bike" as const,
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
  };
  return {
    id: `plan-${index}`,
    profile_id: PROFILE_ID,
    name: `Plan ${index}`,
    description: null,
    structure,
    structure_hash: activityPlanStructureHash(structure),
    gps_recording_enabled: true,
    updated_at: "2026-07-12T12:00:00.000Z",
  };
}

describe("on-demand estimator CPU benchmark", () => {
  for (const [count, thresholdMs] of thresholds) {
    benchmark(
      `${count} plans p95 is below ${thresholdMs}ms`,
      async () => {
        const plans = Array.from({ length: count }, (_, index) => createBenchmarkPlan(index));
        const performanceRepository = createTestPerformanceModelRepository({
          cyclingPlanningThresholdPowerWatts: null,
        });
        const store = {
          getEstimationInputs: async () => ({ routes: [] }),
          readAthletePerformanceEvidenceSnapshot:
            performanceRepository.readAthletePerformanceEvidenceSnapshot,
        } satisfies EstimationReadStore;
        const run = () =>
          getActivityPlansDerivedMetrics(plans, {} as DrizzleDbClient, store, PROFILE_ID, {
            asOf: new Date("2026-07-12T12:00:00.000Z"),
          });

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try {
          // Warm JIT/module paths before collecting enough samples for a stable p95.
          for (let iteration = 0; iteration < 10; iteration++) await run();

          const samples: number[] = [];
          for (let iteration = 0; iteration < 50; iteration++) {
            const start = process.threadCpuUsage();
            await run();
            const elapsed = process.threadCpuUsage(start);
            samples.push((elapsed.user + elapsed.system) / 1_000);
          }
          samples.sort((a, b) => a - b);
          const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
          if (p95 === undefined) throw new Error("Benchmark did not collect timing samples");
          expect(errorSpy).not.toHaveBeenCalled();
          expect(p95, `p95=${p95.toFixed(2)}ms`).toBeLessThan(thresholdMs);
        } finally {
          errorSpy.mockRestore();
        }
      },
      BENCHMARK_TIMEOUT_MS,
    );
  }
});
