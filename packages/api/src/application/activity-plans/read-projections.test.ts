import {
  activityPlanStructureSchema,
  createActivityPlanQuantificationIdentities,
  createUnavailableAthletePerformanceTargetFacts,
  ENDURANCE_SWIM,
  estimateActivityPlanForTrainingContext,
  SAMPLE_THRESHOLD_HR_WORKOUT,
} from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.example.test/profile-avatars/${path}` },
        }),
      }),
    },
  }),
}));

import {
  createActivityPlanProjectionMetrics,
  toActivityPlanDetail,
  toActivityPlanSummary,
  toScheduledActivityPlanSummary,
} from "./read-projections";
import { activityPlanCanonicalStructureHash } from "./structure-hash";

const PLAN_ID = "80000000-0000-4000-8000-000000000001";
const PROFILE_ID = "90000000-0000-4000-8000-000000000001";
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000003",
      name: "Steady",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
});
const mixedDurationStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000013",
      name: "Timed warmup",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "RPE", intensity: 4 }],
    },
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000014",
      name: "Distance work",
      duration: { type: "distance", meters: 1000 },
      targets: [{ type: "RPE", intensity: 6 }],
    },
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000015",
      name: "Strength finish",
      duration: { type: "repetitions", count: 10 },
      targets: [{ type: "RPE", intensity: 7 }],
    },
  ],
});
const derivedDistanceStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000023",
      name: "Steady",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "speed", intensity: 12 }],
    },
  ],
});
const derivedDurationStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "strength",
  items: [
    {
      type: "step",
      id: "70000000-0000-4000-8000-000000000033",
      name: "Repetitions",
      duration: { type: "repetitions", count: 6 },
      targets: [{ type: "RPE", intensity: 8 }],
    },
  ],
});
function planRow(planStructure: unknown) {
  return {
    id: PLAN_ID,
    profile_id: PROFILE_ID,
    name: "Bike plan",
    structure: planStructure,
    structure_hash: `v1:sha256:${"a".repeat(64)}`,
    revision: 1,
    gps_recording_enabled: true,
    content_visibility: "private",
    is_system_template: false,
    created_at: "2026-07-17T08:00:00.000Z",
    updated_at: "2026-07-17T08:00:00.000Z",
    owner: { username: " ", avatar_url: `${PROFILE_ID}/legacy-avatar.png` },
    prescriptionQuantification: null,
  };
}
function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...nestedKeys(child)]);
}
describe("toActivityPlanSummary", () => {
  it("normalizes malformed owner presentation fields", () => {
    const result = toActivityPlanSummary(planRow(structure), PROFILE_ID);
    expect(result.owner).toEqual({
      id: PROFILE_ID,
      username: null,
      avatarUrl: `https://storage.example.test/profile-avatars/${PROFILE_ID}/legacy-avatar.png`,
    });
    expect(result.structure).toEqual(structure);
    expect(Object.hasOwn(result, "prescriptionQuantification")).toBe(true);
  });
  it("keeps partial and unavailable summary quantities explicit instead of substituting zero", () => {
    const result = toActivityPlanSummary(planRow(mixedDurationStructure), PROFILE_ID);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", status: "unavailable", value: null }),
        expect.objectContaining({ key: "distance", status: "unavailable", value: null }),
        expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
        expect.objectContaining({
          key: "objective_intensity",
          status: "unavailable",
          value: null,
        }),
      ]),
    );
    expect(result.metrics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", status: "available", value: 0 }),
      ]),
    );
    expect(result.planProjection?.distance).toMatchObject({
      status: "partial",
      value: 1000,
    });
    expect(result.prescriptionQuantification?.summary.distance).toMatchObject({
      status: "partial",
      value: 1000,
    });
    expect(result.structure).toEqual(mixedDurationStructure);
  });
  it("promotes complete derived distance and duration with estimated provenance", () => {
    const distance = toActivityPlanSummary(planRow(derivedDistanceStructure), PROFILE_ID);
    const duration = toActivityPlanSummary(planRow(derivedDurationStructure), PROFILE_ID);
    expect(distance.planProjection?.distance).toMatchObject({
      status: "complete",
      provenance: "derived",
    });
    expect(distance.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "distance",
          status: "available",
          value: expect.closeTo(2000),
          provenance: "estimated",
        }),
      ]),
    );
    expect(duration.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "elapsed_duration",
          status: "available",
          value: 60,
          provenance: "estimated",
        }),
      ]),
    );
  });
  it("projects the current threshold-HR fixture's authored duration and estimated load", () => {
    const result = toActivityPlanSummary(
      {
        ...planRow(SAMPLE_THRESHOLD_HR_WORKOUT.structure),
        name: SAMPLE_THRESHOLD_HR_WORKOUT.name,
      },
      PROFILE_ID,
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "elapsed_duration",
          status: "available",
          value: 3300,
        }),
        expect.objectContaining({
          key: "common_load",
          status: "available",
          value: expect.closeTo(56.10416666666666),
          provenance: "estimated",
        }),
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: expect.closeTo(0.759090909090909),
          provenance: "estimated",
        }),
      ]),
    );
  });
  it.each([
    "public",
    "followers",
    "private",
  ] as const)("serializes the authored prescription for an authorized non-owner %s projection", (contentVisibility) => {
    const row = {
      ...planRow(structure),
      content_visibility: contentVisibility,
      prescriptionQuantification: { privateThresholdContext: 300 },
    };
    const summary = toActivityPlanSummary(row, "viewer-2");
    const detail = toActivityPlanDetail(row, "viewer-2");
    const scheduled = toScheduledActivityPlanSummary({
      plan: row,
      viewerId: "viewer-2",
      eventId: "event-1",
      calendarDate: "2026-08-18",
      startsAt: "2026-08-18T08:00:00.000Z",
      endsAt: "2026-08-18T09:00:00.000Z",
      allDay: false,
      status: "scheduled",
      trainingPlanId: null,
    });
    for (const projection of [summary, detail, scheduled]) {
      expect(projection.structure).toEqual(structure);
      expect(Object.hasOwn(projection, "prescriptionQuantification")).toBe(false);
      expect(projection.metrics).toEqual([
        expect.objectContaining({ key: "distance", status: "unavailable", provenance: null }),
        expect.objectContaining({
          key: "elapsed_duration",
          status: "available",
          value: 1800,
          provenance: "authored",
        }),
        expect.objectContaining({
          key: "common_load",
          status: "available",
          provenance: "estimated",
        }),
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: 0.75,
          provenance: "estimated",
        }),
      ]);
      expect(projection).not.toHaveProperty("prescribedIntensity");
      expect(projection.capabilities).toMatchObject({
        canDuplicate: false,
        canRecord: true,
        canSchedule: false,
      });
      expect(nestedKeys(JSON.parse(JSON.stringify(projection)))).toEqual(
        expect.arrayContaining(["duration", "intensity", "targets"]),
      );
      expect(JSON.stringify(projection)).toMatch(/%FTP|targets|duration/);
      expect(JSON.stringify(projection)).not.toMatch(
        /privateThresholdContext|thresholdEvidence|calibration|athlete_personalized/i,
      );
    }
    expect(Object.hasOwn(detail, "notes")).toBe(false);
    expect(detail.structureHash).toBe(activityPlanCanonicalStructureHash(structure));
    expect(Object.hasOwn(detail, "gpsRecordingEnabled")).toBe(false);
  });
  it("keeps mixed completion bases unavailable without exposing calibration data", () => {
    const summary = toActivityPlanSummary(
      {
        ...planRow(mixedDurationStructure),
        content_visibility: "public",
      },
      "viewer-2",
    );
    const metrics = summary.metrics;
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "distance", status: "unavailable", value: null }),
        expect.objectContaining({ key: "elapsed_duration", status: "unavailable", value: null }),
        expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
        expect.objectContaining({
          key: "objective_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          reason: "mixed_completion_bases",
        }),
      ]),
    );
    expect(summary).not.toHaveProperty("prescribedIntensity");
    expect(JSON.stringify(metrics)).not.toMatch(
      /thresholdEvidence|calibration|athlete_personalized|private/i,
    );
    expect(metrics).not.toEqual(expect.arrayContaining([expect.objectContaining({ value: 180 })]));
    expect(metrics).not.toEqual(expect.arrayContaining([expect.objectContaining({ value: 1.5 })]));
    expect(metrics).not.toEqual(expect.arrayContaining([expect.objectContaining({ value: 0.55 })]));
  });
  it("includes only objective intensity in the canonical projection metric array", () => {
    const metrics = createActivityPlanProjectionMetrics({
      id: PLAN_ID,
      structure,
      updatedAt: "2026-07-17T08:00:00.000Z",
    });
    expect(metrics).toHaveLength(4);
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: 0.75,
        }),
      ]),
    );
    expect(metrics.map((metric) => metric.key)).not.toContain("normalized_intensity");
  });
  it("projects the current indoor Endurance Set ratio without inventing duration or load", () => {
    const summary = toActivityPlanSummary(
      { ...planRow(ENDURANCE_SWIM.structure), name: ENDURANCE_SWIM.name },
      PROFILE_ID,
    );
    expect(summary.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", status: "unavailable", value: null }),
        expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: expect.closeTo(0.69),
          provenance: "estimated",
        }),
      ]),
    );
  });
  it("retains full authoring and detail fields for the owner", () => {
    const detail = toActivityPlanDetail(
      {
        ...planRow(structure),
        notes: "Owner instructions",
        prescriptionQuantification: null,
      },
      PROFILE_ID,
    );
    expect(detail.structure).toEqual(structure);
    expect(detail.notes).toBe("Owner instructions");
    expect(detail.structureHash).toMatch(/^v1:sha256:/);
    expect(detail.gpsRecordingEnabled).toBe(true);
    expect(detail.capabilities.canDuplicate).toBe(true);
    expect(detail.metrics.map((metric) => metric.key)).toContain("objective_intensity");
    expect(detail).not.toHaveProperty("prescribedIntensity");
    expect(JSON.stringify(detail)).toMatch(/%FTP|"duration"|"targets"/);
  });
  it("accepts fresh personalized evidence for the owner", () => {
    const facts = buildPerformanceTargetFactsFixture({
      asOf: "2026-07-17T08:00:00.000Z",
      athleteId: PROFILE_ID,
      bikeThresholdWatts: 250,
    });
    const personalizedStructure = structuredClone(structure);
    const step = personalizedStructure.items.flatMap((item) =>
      item.type === "step" ? [item] : item.steps,
    )[0];
    if (!step) throw new Error("Expected activity step");
    step.targets = [{ type: "watts", intensity: 200 }];
    const planning = estimateActivityPlanForTrainingContext({
      asOf: facts.asOf,
      planId: PLAN_ID,
      performanceTargets: facts,
      structure: personalizedStructure,
    });
    const summary = toActivityPlanSummary(
      {
        ...planRow(personalizedStructure),
        prescriptionQuantification: planning.prescriptionQuantification,
        planProjection: planning.planProjection,
      },
      PROFILE_ID,
    );
    expect(
      summary.prescriptionQuantification?.members[0]?.commonLoad.thresholdEvidence,
    ).toMatchObject({ type: "ftp_watts", value: 250 });
    expect(summary.planProjection?.revisionFingerprint).toBe(
      planning.planProjection?.revisionFingerprint,
    );
    expect(summary.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "objective_intensity",
          status: "available",
          value: 0.8,
          provenance: "estimated",
        }),
      ]),
    );
  });
  it("rejects stale quantification and projection revisions and recomputes authored evidence", () => {
    const oldPlanning = estimateActivityPlanForTrainingContext({
      asOf: "2026-07-17T08:00:00.000Z",
      planId: PLAN_ID,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-07-17T08:00:00.000Z",
        PROFILE_ID,
      ),
      structure,
    });
    const revised = structuredClone(structure);
    const step = revised.items.flatMap((item) => (item.type === "step" ? [item] : item.steps))[0];
    if (!step) throw new Error("Expected activity step");
    step.duration = { type: "time", seconds: 2400 };
    const currentFingerprint = createActivityPlanQuantificationIdentities({
      structure: revised,
      planId: PLAN_ID,
    }).evidenceIdentity.revisionFingerprint;
    const summary = toActivityPlanSummary(
      {
        ...planRow(revised),
        prescriptionQuantification: oldPlanning.prescriptionQuantification,
        planProjection: oldPlanning.planProjection,
      },
      PROFILE_ID,
    );
    expect(summary.planProjection?.revisionFingerprint).toBe(currentFingerprint);
    expect(summary.planProjection?.revisionFingerprint).not.toBe(
      oldPlanning.planProjection?.revisionFingerprint,
    );
    expect(summary.prescriptionQuantification?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceIdentity: expect.objectContaining({ revisionFingerprint: currentFingerprint }),
        }),
      ]),
    );
    expect(summary.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "elapsed_duration", value: 2400 })]),
    );
  });
  it("never exposes fresh personalized evidence to a non-owner or system-template projection", () => {
    const facts = buildPerformanceTargetFactsFixture({
      asOf: "2026-07-17T08:00:00.000Z",
      athleteId: PROFILE_ID,
      bikeThresholdWatts: 250,
    });
    const personalizedStructure = structuredClone(structure);
    const step = personalizedStructure.items.flatMap((item) =>
      item.type === "step" ? [item] : item.steps,
    )[0];
    if (!step) throw new Error("Expected activity step");
    step.targets = [{ type: "watts", intensity: 200 }];
    const planning = estimateActivityPlanForTrainingContext({
      asOf: facts.asOf,
      planId: PLAN_ID,
      performanceTargets: facts,
      structure: personalizedStructure,
    });
    const row = {
      ...planRow(personalizedStructure),
      content_visibility: "public" as const,
      prescriptionQuantification: planning.prescriptionQuantification,
      planProjection: planning.planProjection,
    };
    const nonOwner = toActivityPlanSummary(row, "viewer-2");
    const publicOwner = toActivityPlanSummary(row, PROFILE_ID);
    const system = toActivityPlanSummary(
      { ...row, profile_id: null, is_system_template: true },
      PROFILE_ID,
    );
    for (const projection of [nonOwner, publicOwner, system]) {
      expect(
        Object.hasOwn(projection, "prescriptionQuantification")
          ? projection.prescriptionQuantification?.members.every(
              (member) => member.commonLoad.thresholdEvidence === null,
            )
          : true,
      ).toBe(true);
      expect(JSON.stringify(projection)).not.toMatch(/ftp_watts|"provenance":"personalized"/i);
      expect(projection.planProjection?.objectiveIntensity).toMatchObject({
        status: "unavailable",
        value: null,
        reason: "calibration_required",
      });
      expect(projection.metrics.map((metric) => metric.key)).toContain("objective_intensity");
      expect(projection).not.toHaveProperty("prescribedIntensity");
    }
    expect(JSON.stringify(nonOwner)).not.toMatch(/thresholdEvidence/i);
    expect(JSON.stringify(system)).not.toMatch(/thresholdEvidence/i);
  });
  it("keeps the full system-template prescription readable and duplicable", () => {
    const row = {
      ...planRow(structure),
      profile_id: null,
      content_visibility: "public",
      is_system_template: true,
    };
    const summary = toActivityPlanSummary(row, "viewer-2");
    const detail = toActivityPlanDetail(row, "viewer-2");
    expect(detail.capabilities.canRecord).toBe(true);
    expect(detail.structureHash).toBe(activityPlanCanonicalStructureHash(structure));
    expect(detail).not.toHaveProperty("notes");
    expect(summary.capabilities).toMatchObject({
      canDuplicate: true,
      canEdit: false,
      canRecord: true,
    });
    expect(summary.structure).toEqual(structure);
    expect(summary.metrics.map((metric) => metric.key)).toContain("objective_intensity");
    expect(summary).not.toHaveProperty("prescribedIntensity");
  });
});
