import { describe, expect, it } from "vitest";

import type { RecordingConfiguration } from "@repo/core";
import { shouldApplyAutoFollowAuthority } from "./autoFollowRuntime";

function buildConfiguration(
  overrides: Partial<RecordingConfiguration["capabilities"]>,
): RecordingConfiguration {
  return {
    input: {
      activityCategory: "bike",
      gpsRecordingEnabled: false,
      mode: "planned",
      plan: {
        hasStructure: true,
        hasRoute: true,
        stepCount: 2,
        requiresManualAdvance: false,
      },
      devices: {
        hasPowerMeter: false,
        hasHeartRateMonitor: false,
        hasCadenceSensor: false,
      },
      gpsAvailable: false,
    },
    capabilities: {
      canTrackLocation: false,
      canTrackPower: true,
      canTrackHeartRate: false,
      canTrackCadence: false,
      shouldShowMap: true,
      shouldShowSteps: true,
      shouldShowRouteOverlay: false,
      shouldShowTurnByTurn: false,
      shouldShowFollowAlong: false,
      shouldShowTrainerControl: true,
      canAutoAdvanceSteps: true,
      shouldAutoFollowTargets: true,
      autoFollowPriority: "plan_targets",
      autoFollowConflict: true,
      autoFollowConflictReason: "conflict",
      primaryMetric: "power",
      isValid: true,
      errors: [],
      warnings: [],
      ...overrides,
    },
  };
}

describe("autoFollowRuntime", () => {
  it("allows only the winning authority to auto-control the trainer", () => {
    const configuration = buildConfiguration({
      autoFollowPriority: "plan_targets",
      shouldAutoFollowTargets: true,
    });

    expect(shouldApplyAutoFollowAuthority(configuration, "plan_targets")).toBe(true);
    expect(shouldApplyAutoFollowAuthority(configuration, "route_simulation")).toBe(false);
  });

  it("disables all automatic authorities when auto follow is off", () => {
    const configuration = buildConfiguration({
      shouldAutoFollowTargets: false,
      autoFollowPriority: "none",
      autoFollowConflict: false,
      autoFollowConflictReason: null,
    });

    expect(shouldApplyAutoFollowAuthority(configuration, "plan_targets")).toBe(false);
    expect(shouldApplyAutoFollowAuthority(configuration, "route_simulation")).toBe(false);
  });
});
