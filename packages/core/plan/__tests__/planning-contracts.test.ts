import { describe, expect, it } from "vitest";
import {
  buildDailyPrescriptionPoints,
  buildPlanningDiagnostics,
  dailyLoadReasonCodeSchema,
  plannedTrainingSessionSchema,
  planningEngineInputSchema,
} from "../planningContracts";

describe("planning contracts", () => {
  it("validates planned training sessions as a canonical engine boundary", () => {
    expect(
      plannedTrainingSessionSchema.parse({
        date: "2026-01-05",
        estimatedTss: 72,
        activityCategory: "run",
        primaryFocus: "threshold",
        source: "generated",
      }),
    ).toMatchObject({ date: "2026-01-05", estimatedTss: 72 });

    expect(() => plannedTrainingSessionSchema.parse({ estimatedTss: 72 })).toThrow();
  });

  it("keeps daily load reason codes schema-backed", () => {
    expect(dailyLoadReasonCodeSchema.parse("planned_session_date_applied")).toBe(
      "planned_session_date_applied",
    );
    expect(() => dailyLoadReasonCodeSchema.parse("typo_reason_code")).toThrow();
  });

  it("validates the canonical projection engine input shape", () => {
    const input = planningEngineInputSchema.parse({
      timeline: { start_date: "2026-01-05", end_date: "2026-01-11" },
      blocks: [{ name: "Build", phase: "build" }],
      goals: [{ name: "Race", target_date: "2026-01-11" }],
      planned_sessions: [{ date: "2026-01-07", estimatedTss: 70 }],
    });

    expect(input.planned_sessions?.[0]?.date).toBe("2026-01-07");
  });

  it("builds canonical prescription points and compact diagnostics from daily recommendations", () => {
    const points = [
      {
        date: "2026-01-05",
        recommendedLoadTss: 80,
        recommendedDurationMinutes: 60,
        recommendedFatigueCost: 80,
        recommendedStrengthSets: 0,
        primaryFocus: "threshold" as const,
        activityCategory: "run" as const,
        confidence_score: 92,
        reasonCodes: ["daily_load_distribution_v1", "planned_session_date_applied"],
      },
      {
        date: "2026-01-06",
        recommendedLoadTss: 0,
        recommendedDurationMinutes: 0,
        recommendedFatigueCost: 0,
        recommendedStrengthSets: 0,
        primaryFocus: "rest" as const,
        activityCategory: "other" as const,
        confidence_score: 85,
        reasonCodes: ["daily_load_distribution_v1", "rest_day_allocation"],
      },
    ];

    const prescriptions = buildDailyPrescriptionPoints(points);
    const diagnostics = buildPlanningDiagnostics(points);

    expect(prescriptions[0]?.sessions[0]).toMatchObject({
      source: "planned_session",
      key_session: true,
      target_load_tss: 80,
    });
    expect(prescriptions[1]?.sessions).toEqual([]);
    expect(diagnostics).toMatchObject({
      version: 1,
      day_count: 2,
      training_day_count: 1,
      planned_session_anchor_count: 1,
    });
  });
});
