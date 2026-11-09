import { describe, expect, it } from "vitest";
import {
  primaryRecordingGuidanceRoute,
  recordingGuidanceFromTcx,
  recordingGuidanceTimelineSchema,
  recordingGuidanceWasModified,
  validateRecordingIntensityScale,
} from "./guidance";

const initial = {
  revision: 0,
  kind: "initial",
  timestamp: "2026-09-20T10:00:00.000Z",
  elapsedMs: 0,
  activeMs: 0,
  plan: null,
  routeId: null,
  intensityScale: 1,
};
describe("versioned live recording guidance", () => {
  it("keeps first route association while retaining replacements and detachments", () => {
    const routeId = "10000000-0000-4000-8000-000000000001";
    const timeline = recordingGuidanceTimelineSchema.parse({
      version: 1,
      revisions: [
        initial,
        {
          ...initial,
          revision: 1,
          kind: "route",
          routeId,
          timestamp: "2026-09-20T10:00:01.000Z",
          elapsedMs: 1000,
          activeMs: 500,
        },
        {
          ...initial,
          revision: 2,
          kind: "route",
          timestamp: "2026-09-20T10:00:02.000Z",
          elapsedMs: 2000,
          activeMs: 500,
        },
      ],
    });
    expect(primaryRecordingGuidanceRoute(timeline)).toBe(routeId);
    expect(recordingGuidanceWasModified(timeline)).toBe(false);
    expect(
      recordingGuidanceFromTcx(
        `<GradientPeakExecution>${JSON.stringify({ guidance: timeline })}</GradientPeakExecution>`,
      ),
    ).toEqual(timeline);
  });
  it("marks only plan or intensity changes as prescription modifications", () => {
    for (const kind of ["plan", "intensity"] as const) {
      const revision =
        kind === "plan"
          ? {
              ...initial,
              revision: 1,
              kind,
              timestamp: "2026-09-20T10:00:01.000Z",
              closedExecution: {
                currentOccurrenceIndex: null,
                occurrenceStartedMovingMs: 0,
                completedOccurrenceIds: [],
                skippedOccurrenceIds: [],
                transitions: [],
                laps: [],
                checkpoints: [],
              },
            }
          : {
              ...initial,
              revision: 1,
              kind,
              timestamp: "2026-09-20T10:00:01.000Z",
              intensityScale: 0.9,
            };
      expect(
        recordingGuidanceWasModified(
          recordingGuidanceTimelineSchema.parse({ version: 1, revisions: [initial, revision] }),
        ),
      ).toBe(true);
    }
  });
  it("allows a plan epoch to close after an intensity revision", () => {
    const plan = {
      manifestVersion: 2,
      compilerVersion: 3,
      activityPlanId: "10000000-0000-4000-8000-000000000001",
      scheduledEventId: null,
      name: "Tempo",
      description: null,
      activityPlanRevision: 1,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      structure: {
        version: 5,
        activity_category: "bike",
        items: [
          {
            type: "step",
            id: "40000000-0000-4000-8000-000000000001",
            name: "Tempo",
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "%FTP", intensity: 75 }],
          },
        ],
      },
      plannedSession: null,
      personalizationEnabled: false,
      targetPresentations: [],
    };
    const execution = {
      currentOccurrenceIndex: 0,
      occurrenceStartedMovingMs: 100,
      completedOccurrenceIds: [],
      skippedOccurrenceIds: [],
      transitions: [],
      laps: [],
      checkpoints: [],
    };
    const parsed = recordingGuidanceTimelineSchema.safeParse({
      version: 1,
      revisions: [
        initial,
        {
          ...initial,
          revision: 1,
          kind: "plan",
          timestamp: "2026-09-20T10:00:01.000Z",
          elapsedMs: 1000,
          activeMs: 100,
          plan,
          closedExecution: { ...execution, currentOccurrenceIndex: null },
        },
        {
          ...initial,
          revision: 2,
          kind: "intensity",
          timestamp: "2026-09-20T10:00:02.000Z",
          elapsedMs: 2000,
          activeMs: 200,
          plan,
          intensityScale: 0.9,
        },
        {
          ...initial,
          revision: 3,
          kind: "plan",
          timestamp: "2026-09-20T10:00:03.000Z",
          elapsedMs: 3000,
          activeMs: 300,
          closedExecution: execution,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
  it.each([NaN, Infinity, 0, 0.49, 1.51])("rejects unsupported scale %s", (scale) => {
    expect(() => validateRecordingIntensityScale(scale, initial.timestamp)).toThrow();
  });
  it("accepts supported bounds using the shared override contract", () => {
    expect(validateRecordingIntensityScale(0.5, initial.timestamp)).toBe(0.5);
    expect(validateRecordingIntensityScale(1.5, initial.timestamp)).toBe(1.5);
  });
  it("rejects out-of-order, overlong and unclosed plan revisions", () => {
    for (const revision of [
      { ...initial, revision: 2, kind: "route" },
      { ...initial, revision: 1, kind: "plan" },
      { ...initial, revision: 1, kind: "route", activeMs: 100, elapsedMs: 50 },
    ])
      expect(
        recordingGuidanceTimelineSchema.safeParse({ version: 1, revisions: [initial, revision] })
          .success,
      ).toBe(false);
    expect(
      recordingGuidanceTimelineSchema.safeParse({
        version: 1,
        revisions: Array.from({ length: 65 }, (_, revision) => ({
          ...initial,
          revision,
          kind: revision ? "route" : "initial",
        })),
      }).success,
    ).toBe(false);
  });
  it("rejects closed visits outside their preceding free-guidance epoch", () => {
    const closedExecution = {
      currentOccurrenceIndex: null,
      occurrenceStartedMovingMs: 0,
      completedOccurrenceIds: ["invented"],
      skippedOccurrenceIds: [],
      transitions: [
        {
          type: "complete" as const,
          timestamp: "2026-09-20T10:00:02.000Z",
          elapsedMs: 2000,
          movingMs: 0,
          fromOccurrenceId: "invented",
          toOccurrenceId: null,
        },
      ],
      laps: [],
      checkpoints: [],
    };
    expect(
      recordingGuidanceTimelineSchema.safeParse({
        version: 1,
        revisions: [
          initial,
          {
            ...initial,
            revision: 1,
            kind: "plan",
            timestamp: "2026-09-20T10:00:01.000Z",
            elapsedMs: 1000,
            activeMs: 0,
            closedExecution,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
