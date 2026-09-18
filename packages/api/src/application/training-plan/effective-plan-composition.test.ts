import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { commonLoadAggregateSchema } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { composeEffectivePlanDto } from "./effective-plan-composition";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: id(1),
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: id(2),
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Steady",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});
const manifest = createResolutionManifestFixture({
  activityPlanId: id(4),
  structure,
  demand: {
    activity_category: "run",
    training_intent: "general_maintenance",
    target_duration_minutes: 30,
    target_common_load: null,
    importance: "normal",
  },
});
const commonLoad = commonLoadAggregateSchema.parse({
  status: "complete",
  model: "gradientpeak_relative_load",
  version: "1",
  load: 50,
  intensity: 1,
  contributingDurationSeconds: 1800,
  knownDurationSeconds: 1800,
  contributingActivityCount: 1,
  partialActivityCount: 0,
  unavailableActivityCount: 0,
  totalActivityCount: 1,
  activityCountCoverage: 1,
  knownDurationCoverage: 1,
  unknownDurationActivityCount: 0,
});

describe("composeEffectivePlanDto", () => {
  it("uses canonical manifests and direct common-load envelopes without fabricating prescription members", () => {
    const result = composeEffectivePlanDto({
      scheduledItems: [
        {
          scheduledItemId: id(5),
          scheduledDate: "2026-07-24",
          status: "active",
          linkedCompletedActivityId: null,
          commonLoad,
          resolutionManifest: manifest,
        },
      ],
      completedActivities: [],
      scheduledSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      completedSource: { status: "complete", startDate: "2026-07-24", endDate: "2026-07-24" },
      planningTimezone: "UTC",
      asOfInstant: "2026-07-23T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "available",
      firm: { status: "complete", commonLoad: { load: 50 } },
      lifecycleQuantifications: { prescriptions: null, comparison: null },
      firmItems: [{ kind: "scheduled", resolutionManifest: { fingerprint: manifest.fingerprint } }],
    });
  });
});
