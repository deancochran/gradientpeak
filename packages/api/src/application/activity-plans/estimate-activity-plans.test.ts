import {
  activityPlanStructureSchema,
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishedState = vi.hoisted(() => ({
  readPublishedAthletePerformanceTargets: vi.fn(),
}));

vi.mock("../athlete-intelligence/published-athlete-state", () => publishedState);

import { estimateActivityPlans } from "./estimate-activity-plans";

const asOf = new Date("2026-08-01T12:00:00.000Z");
const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      role: "activity",
      id: "70000000-0000-4000-8000-000000000001",
      name: "Scheduled bike",
      intervals: [
        {
          id: "70000000-0000-4000-8000-000000000002",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "70000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});

const plan = {
  id: "80000000-0000-4000-8000-000000000001",
  profile_id: "90000000-0000-4000-8000-000000000001",
  name: "Bike plan",
  description: null,
  structure,
  structure_hash: `v1:sha256:${"a".repeat(64)}`,
  gps_recording_enabled: true,
  updated_at: asOf,
};

describe("estimateActivityPlans", () => {
  beforeEach(() => {
    publishedState.readPublishedAthletePerformanceTargets.mockReset();
  });

  it("estimates through the current published athlete-state snapshot", async () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(
      asOf.toISOString(),
      plan.profile_id,
    );
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: "available",
      targets,
    });

    const [estimated] = await estimateActivityPlans([plan], {} as never, plan.profile_id, {
      asOf,
      personalize: true,
    });

    expect(publishedState.readPublishedAthletePerformanceTargets).toHaveBeenCalledWith({
      db: {},
      profileId: plan.profile_id,
      now: asOf,
    });
    expect(estimated?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 1_800,
      unit: "seconds",
    });
    expect(estimated?.prescriptionQuantification.members).toHaveLength(1);
  });

  it("keeps unanchored relative plan intent when athlete facts are unavailable", async () => {
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: "stale",
      targets: createUnavailableAthletePerformanceTargetFacts(asOf.toISOString(), plan.profile_id),
    });

    const [estimated] = await estimateActivityPlans([plan], {} as never, plan.profile_id, { asOf });

    expect(estimated?.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 0.75,
    });
    expect(
      estimated?.prescriptionQuantification.members[0]?.commonLoad.thresholdEvidence,
    ).toBeNull();
    expect(estimated).not.toHaveProperty("estimation_warnings");
    expect(publishedState.readPublishedAthletePerformanceTargets).not.toHaveBeenCalled();
  });

  it.each([
    ["confirmed", "complete"],
    ["provisional", "complete"],
    ["stale", "complete"],
    ["unavailable", "complete"],
  ] as const)("applies %s calibration-state planning behavior", async (state, expectedStatus) => {
    const confirmed = buildPerformanceTargetFactsFixture({
      asOf: asOf.toISOString(),
      athleteId: plan.profile_id,
      bikeThresholdWatts: 250,
    });
    const targets =
      state === "confirmed"
        ? confirmed
        : state === "unavailable"
          ? createUnavailableAthletePerformanceTargetFacts(asOf.toISOString(), plan.profile_id)
          : athletePerformanceTargetFactsSchema.parse({
              ...confirmed,
              thresholds: {
                ...confirmed.thresholds,
                bike: {
                  ...confirmed.thresholds.bike,
                  state: state === "provisional" ? "provisional" : "confirmed",
                  freshness: state === "stale" ? "stale" : "fresh",
                },
              },
            });
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: state === "stale" ? "stale" : "available",
      targets,
    });

    const [estimated] = await estimateActivityPlans([plan], {} as never, plan.profile_id, {
      asOf,
      personalize: true,
    });
    expect(estimated?.prescriptionQuantification.summary.commonLoad.status).toBe(expectedStatus);
  });

  it("skips snapshot I/O for an empty batch", async () => {
    await expect(
      estimateActivityPlans([], {} as never, plan.profile_id, { asOf }),
    ).resolves.toEqual([]);
    expect(publishedState.readPublishedAthletePerformanceTargets).not.toHaveBeenCalled();
  });

  it("reads personalization facts for the authenticated viewer, never the plan author", async () => {
    const viewerId = "viewer-profile-1";
    const absoluteStructure = structuredClone(structure);
    const segment = absoluteStructure.segments[0];
    if (!segment || segment.role !== "activity") throw new Error("Expected activity segment");
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Expected activity step");
    step.targets = [{ type: "watts", intensity: 150 }];
    const authoredBySomeoneElse = {
      ...plan,
      profile_id: "author-profile-1",
      structure: absoluteStructure,
    };
    const viewerTargets = buildPerformanceTargetFactsFixture({
      asOf: asOf.toISOString(),
      athleteId: viewerId,
      bikeThresholdWatts: 300,
    });
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: "available",
      targets: viewerTargets,
      publishedRevision: 1,
    });

    const [estimated] = await estimateActivityPlans(
      [authoredBySomeoneElse],
      {} as never,
      viewerId,
      { asOf, personalize: true },
    );

    expect(publishedState.readPublishedAthletePerformanceTargets).toHaveBeenCalledWith({
      db: {},
      profileId: viewerId,
      now: asOf,
    });
    expect(publishedState.readPublishedAthletePerformanceTargets).not.toHaveBeenCalledWith(
      expect.objectContaining({ profileId: authoredBySomeoneElse.profile_id }),
    );
    expect(estimated?.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 0.5,
    });
    expect(
      estimated?.prescriptionQuantification.members[0]?.commonLoad.thresholdEvidence,
    ).toMatchObject({ value: 300 });
  });

  it("keeps viewer-derived absolute-target metrics unavailable and skips fact I/O by default", async () => {
    const absoluteStructure = structuredClone(structure);
    const segment = absoluteStructure.segments[0];
    if (!segment || segment.role !== "activity") throw new Error("Expected activity segment");
    const step = segment.intervals[0]?.steps[0];
    if (!step) throw new Error("Expected activity step");
    step.targets = [{ type: "watts", intensity: 150 }];

    const [estimated] = await estimateActivityPlans(
      [{ ...plan, structure: absoluteStructure }],
      {} as never,
      "viewer-profile-1",
      { asOf },
    );

    expect(publishedState.readPublishedAthletePerformanceTargets).not.toHaveBeenCalled();
    expect(estimated?.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "no_load_data",
    });
  });
});
