import { describe, expect, it } from "vitest";
import {
  type ActivityPlanStructureV3,
  type ActivityPlanTarget,
  activityPlanStructureSchemaV3,
} from "../activity-plan";
import {
  integrationProviderIdValues,
  isProviderRuntimeEnabled,
  providerHasCapability,
} from "../integrations/provider-capabilities";
import {
  getActivityPlanDefaultTarget,
  getActivityPlanProviderReadiness,
} from "./activityPlanProviderReadiness";

function structureWithTargets(
  targets: ActivityPlanTarget[],
  category: "run" | "bike" | "swim" = "run",
): ActivityPlanStructureV3 {
  return activityPlanStructureSchemaV3.parse({
    version: 3,
    segments: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Work",
        role: "activity",
        category,
        intervals: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Set",
            repetitions: 1,
            steps: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Step",
                duration: { type: "time", seconds: 600 },
                targets,
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("activity plan provider readiness", () => {
  it("uses profile anchors for composer defaults and falls back explicitly to RPE", () => {
    expect(
      getActivityPlanDefaultTarget({
        activityCategory: "bike",
        anchors: { ftpWatts: 250 },
      }),
    ).toEqual({ type: "%FTP", intensity: 75 });
    expect(
      getActivityPlanDefaultTarget({
        activityCategory: "run",
        anchors: { thresholdHeartRateBpm: 170 },
      }),
    ).toEqual({ type: "%ThresholdHR", intensity: 75 });
    expect(getActivityPlanDefaultTarget({ activityCategory: "run" })).toEqual({
      type: "RPE",
      intensity: 5,
    });
  });

  it("reports native defaults or a missing anchor according to policy", () => {
    const structure = structureWithTargets([{ type: "%FTP", intensity: 75 }], "bike");

    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "bike",
        provider: "native",
        structure,
      }),
    ).toMatchObject({ status: "uses_defaults", defaultedTargetTypes: ["%FTP"] });
    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "bike",
        nativeDefaultsAvailable: false,
        provider: "native",
        structure,
      }),
    ).toMatchObject({ status: "missing_anchor" });
  });

  it("distinguishes ready, missing-anchor, unsupported-sport, and unsupported-provider results", () => {
    const absoluteRun = structureWithTargets([{ type: "speed", intensity: 5 }]);
    const relativeRun = structureWithTargets([{ type: "%MaxHR", intensity: 80 }]);

    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "run",
        provider: "wahoo",
        structure: absoluteRun,
      }).status,
    ).toBe("ready");
    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "run",
        provider: "wahoo",
        structure: relativeRun,
      }).status,
    ).toBe("missing_anchor");
    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "swim",
        provider: "wahoo",
        structure: structureWithTargets([{ type: "RPE", intensity: 5 }], "swim"),
      }).status,
    ).toBe("unsupported_sport");
    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "run",
        provider: "garmin",
        structure: absoluteRun,
      }),
    ).toMatchObject({
      status: "unsupported_provider",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_provider", blockedBy: "external" }),
      ]),
    });
  });

  it("uses the capability-registry provider taxonomy", () => {
    const structure = structureWithTargets([{ type: "speed", intensity: 5 }]);

    expect(
      integrationProviderIdValues.map(
        (provider) =>
          getActivityPlanProviderReadiness({
            activityCategory: "run",
            provider,
            structure,
          }).provider,
      ),
    ).toEqual(integrationProviderIdValues);
  });

  it("blocks scaffold runtimes externally and only readies declared push providers", () => {
    const structure = structureWithTargets([{ type: "speed", intensity: 5 }]);

    for (const provider of integrationProviderIdValues) {
      const result = getActivityPlanProviderReadiness({
        activityCategory: "run",
        provider,
        structure,
      });

      if (!isProviderRuntimeEnabled(provider)) {
        expect(result).toMatchObject({
          status: "unsupported_provider",
          issues: expect.arrayContaining([
            expect.objectContaining({ code: "unsupported_provider", blockedBy: "external" }),
          ]),
        });
      } else {
        expect(providerHasCapability(provider, "planned_activity_push")).toBe(true);
        expect(result.status).toBe("ready");
      }
    }
  });

  it("returns an explicit runtime-blocked result for TrainingPeaks", () => {
    expect(
      getActivityPlanProviderReadiness({
        activityCategory: "run",
        provider: "trainingpeaks",
        structure: structureWithTargets([{ type: "speed", intensity: 5 }]),
      }),
    ).toMatchObject({
      provider: "trainingpeaks",
      status: "unsupported_provider",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_provider", blockedBy: "external" }),
      ]),
    });
  });

  it("identifies an incompatible secondary target instead of hiding it", () => {
    const result = getActivityPlanProviderReadiness({
      activityCategory: "run",
      provider: "wahoo",
      structure: structureWithTargets([
        { type: "speed", intensity: 5 },
        { type: "RPE", intensity: 6 },
      ]),
    });

    expect(result.status).toBe("unsupported_target");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        targetType: "RPE",
        path: ["structure", "segments", 0, "intervals", 0, "steps", 0, "targets", 1],
      }),
    );
  });

  it("classifies every compiled occurrence semantic exactly once", () => {
    const structure = structureWithTargets([{ type: "speed", intensity: 5 }]);
    const result = getActivityPlanProviderReadiness({ provider: "wahoo", structure });

    expect(result.projection.disposition).toBe("compatible");
    expect(result.projection.findings.map((finding) => finding.semantic)).toEqual([
      "occurrence_role",
      "activity_category",
      "duration",
      "target",
    ]);
    expect(
      result.projection.findings.every((finding) => finding.disposition === "compatible"),
    ).toBe(true);
  });

  it("continues exhaustive semantic inventory behind an evidence-gated provider blocker", () => {
    const result = getActivityPlanProviderReadiness({
      provider: "garmin",
      structure: structureWithTargets([{ type: "speed", intensity: 5 }]),
    });

    expect(result.projection.disposition).toBe("unsupported");
    expect(result.projection.findings.map((finding) => finding.semantic)).toEqual([
      "provider",
      "occurrence_role",
      "activity_category",
      "duration",
      "target",
    ]);
    expect(result.projection.findings[0]).toMatchObject({
      disposition: "unsupported",
      reasonCode: "provider_delivery_evidence_missing",
    });
  });
});
