import { describe, expect, it } from "vitest";

import { athleteIntelligenceModelInputSchema } from "../model-input-contracts";
import { buildAthleteIntelligenceModel } from "./model-fixture-builder";

describe("buildAthleteIntelligenceModel", () => {
  it("creates a valid model with linked evidence and explicit complete coverage", () => {
    const model = buildAthleteIntelligenceModel();

    expect(athleteIntelligenceModelInputSchema.safeParse(model).success).toBe(true);
    expect(model.metricEvidence[0]?.value.evidenceSourceIds).toEqual(["metric:ftp"]);
    expect(model.goals[0]?.goalSport).toBe("run");
    expect(model.readCoverage).toEqual({
      metrics: { state: "complete", reason: null },
      activities: { state: "complete", reason: null },
      efforts: { state: "complete", reason: null },
      schedules: { state: "complete", reason: null },
    });
  });

  it("supports typed whole-slice overrides while retaining schema validation", () => {
    const model = buildAthleteIntelligenceModel({
      efforts: [],
      readCoverage: {
        metrics: { state: "complete", reason: null },
        activities: { state: "truncated", reason: "query_limit_reached" },
        efforts: { state: "complete", reason: null },
        schedules: { state: "truncated", reason: "source_window_truncated" },
      },
      scheduleReadState: "truncated",
    });

    expect(model.readCoverage.activities.state).toBe("truncated");
    expect(model.scheduleReadState).toBe("truncated");
  });

  it("rejects incoherent legacy schedule state supplied through overrides", () => {
    expect(() =>
      buildAthleteIntelligenceModel({
        readCoverage: {
          metrics: { state: "complete", reason: null },
          activities: { state: "complete", reason: null },
          efforts: { state: "complete", reason: null },
          schedules: { state: "truncated", reason: "query_limit_reached" },
        },
        scheduleReadState: "complete",
      }),
    ).toThrow();
  });
});
