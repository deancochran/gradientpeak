import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  toActivityPlanDetail,
  toActivityPlanSummary,
  toScheduledActivityPlanSummary,
} from "./read-projections";

const PLAN_ID = "80000000-0000-4000-8000-000000000001";
const PROFILE_ID = "90000000-0000-4000-8000-000000000001";

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

const mixedDurationStructure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      role: "activity",
      id: "70000000-0000-4000-8000-000000000011",
      name: "Mixed completion",
      intervals: [
        {
          id: "70000000-0000-4000-8000-000000000012",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "70000000-0000-4000-8000-000000000013",
              name: "Timed warmup",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "RPE", intensity: 4 }],
            },
            {
              id: "70000000-0000-4000-8000-000000000014",
              name: "Distance work",
              duration: { type: "distance", meters: 1_000 },
              targets: [{ type: "RPE", intensity: 6 }],
            },
            {
              id: "70000000-0000-4000-8000-000000000015",
              name: "Strength finish",
              duration: { type: "repetitions", count: 10 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
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
    owner: { username: " ", avatar_url: "/legacy-avatar.png" },
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

    expect(result.owner).toEqual({ id: PROFILE_ID, username: null, avatarUrl: null });
    expect(result.structure).toEqual(structure);
    expect(Object.hasOwn(result, "prescriptionQuantification")).toBe(true);
  });

  it("keeps partial and unavailable summary quantities explicit instead of substituting zero", () => {
    const result = toActivityPlanSummary(planRow(mixedDurationStructure), PROFILE_ID);

    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "elapsed_duration", status: "partial", value: 600 }),
        expect.objectContaining({ key: "distance", status: "partial", value: 1_000 }),
        expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
        expect.objectContaining({
          key: "normalized_intensity",
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
    expect(result.structure).toEqual(mixedDurationStructure);
  });

  it.each([
    "public",
    "followers",
  ] as const)("serializes the authored prescription for a non-owner %s projection", (contentVisibility) => {
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
          value: 1_800,
          provenance: "authored",
        }),
        expect.objectContaining({
          key: "common_load",
          status: "available",
          provenance: "plan_intent",
        }),
        expect.objectContaining({
          key: "normalized_intensity",
          status: "available",
          value: 0.75,
          provenance: "plan_intent",
        }),
      ]);
      expect(projection.capabilities).toMatchObject({
        canDuplicate: false,
        canRecord: false,
        canSchedule: true,
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
    expect(Object.hasOwn(detail, "structureHash")).toBe(false);
    expect(Object.hasOwn(detail, "gpsRecordingEnabled")).toBe(false);
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
    expect(JSON.stringify(detail)).toMatch(/%FTP|"duration"|"targets"/);
  });

  it("keeps the full system-template prescription readable and duplicable", () => {
    const summary = toActivityPlanSummary(
      {
        ...planRow(structure),
        profile_id: null,
        content_visibility: "public",
        is_system_template: true,
      },
      "viewer-2",
    );

    expect(summary.capabilities).toMatchObject({
      canDuplicate: true,
      canEdit: false,
      canRecord: false,
    });
    expect(summary.structure).toEqual(structure);
  });
});
