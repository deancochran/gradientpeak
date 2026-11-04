import type { ActivityPlanSummary } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createActivityPlanSummary } from "../../test/activity-plan-projection-fixture";
import type { ProjectionPreviewOutput } from "./backend-planning/types";
import { buildCreationChartPoints } from "./creationChartPresentation";
import type { TrainingPlanBuilderSession } from "./types";

const session = (offsetDays: number, load: number | null): TrainingPlanBuilderSession => ({
  id: `s-${offsetDays}-${load}`,
  localId: `s-${offsetDays}-${load}`,
  offsetDays,
  demand: {
    activity_category: "run",
    training_intent: "aerobic_base",
    target_duration_minutes: null,
    target_common_load: null,
    importance: "normal",
  },
  activityPlan:
    load === null
      ? null
      : {
          id: `plan-${load}`,
          name: "Run",
          accessible: true,
          published: false,
          prescriptionQuantification: null,
        },
});
const activityPlans: Record<string, ActivityPlanSummary> = Object.fromEntries(
  [0, 40, 80].map((load) => {
    const summary = createActivityPlanSummary();
    return [
      `plan-${load}`,
      {
        ...summary,
        metrics: summary.metrics.map((metric) =>
          metric.key === "common_load"
            ? {
                ...metric,
                status: "available",
                value: load,
                unit: "score",
                reason: null,
                provenance: "estimated",
              }
            : metric,
        ),
      } as ActivityPlanSummary,
    ];
  }),
);
const input = {
  startDate: "2026-11-04",
  windowStart: "2026-11-04",
  windowEnd: "2026-11-06",
  sessions: [],
  activityPlans,
  preview: null,
};

describe("creation chart Plan-tab adapter", () => {
  it("places UUID-session forecasts on the authoritative planning date across UTC boundaries", () => {
    const preview = {
      status: "available",
      sessionResults: [
        { sourceSessionId: "session-uuid", planningDate: "2026-11-04", status: "needs_input" },
      ],
      simulation: {
        transitions: [
          {
            sourceId: "session-uuid",
            toAsOf: "2026-11-03T14:00:00Z",
            state: { longTermLoad: 40, recentLoad: 50, loadBalance: -10 },
          },
        ],
      },
    } as unknown as ProjectionPreviewOutput;
    expect(buildCreationChartPoints({ ...input, preview })[0]).toMatchObject({
      date: "2026-11-04",
      scheduledFitnessCtl: 40,
      scheduledFatigueAtl: 50,
      scheduledFormTsb: -10,
    });
  });
  it("shows rest days but never invents a physiological forecast", () => {
    const points = buildCreationChartPoints(input);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({
      date: "2026-11-04",
      plannedLoad: 0,
      plannedLoadStatus: "known_zero",
      scheduledFitnessCtl: null,
      scheduledFatigueAtl: null,
      scheduledFormTsb: null,
    });
  });
  it("keeps all unknown load unavailable and mixed known load partial", () => {
    const points = buildCreationChartPoints({
      ...input,
      sessions: [session(0, null), session(1, 40), session(1, null), session(2, 0)],
    });
    expect(points[0]).toMatchObject({ plannedLoad: null, plannedLoadStatus: "unavailable" });
    expect(points[1]).toMatchObject({
      plannedLoad: 40,
      plannedLoadStatus: "partial",
      effectiveRemainingLoadStatus: "partial",
    });
    expect(points[2]).toMatchObject({ plannedLoad: 0, plannedLoadStatus: "complete" });
  });
  it("uses plan-relative offsets for future windows without extending the forecast", () => {
    const points = buildCreationChartPoints({
      ...input,
      windowStart: "2026-12-16",
      windowEnd: "2026-12-17",
      sessions: [session(42, 80)],
    });
    expect(points[0]).toMatchObject({
      date: "2026-12-16",
      plannedLoad: 80,
      scheduledFitnessCtl: null,
    });
  });
  it("does not mistake resolver demand targets for achieved load", () => {
    const draft = session(0, 80);
    draft.demand.target_common_load = 100;
    expect(buildCreationChartPoints({ ...input, sessions: [draft] })[0]).toMatchObject({
      plannedLoad: null,
      plannedLoadStatus: "unavailable",
    });
    draft.demand.target_common_load = null;
    draft.demand.target_duration_minutes = 90;
    expect(buildCreationChartPoints({ ...input, sessions: [draft] })[0]?.plannedLoad).toBeNull();
  });
  it("prefers authoritative resolution and preserves partial quantities", () => {
    const draft = session(0, 80);
    draft.demand.target_common_load = 100;
    const preview = {
      status: "available",
      simulation: { transitions: [] },
      sessionResults: [
        {
          sourceSessionId: draft.id,
          status: "resolved",
          manifest: { prescription_estimate: { common_load: { value: 72, status: "partial" } } },
        },
      ],
    } as unknown as ProjectionPreviewOutput;
    expect(buildCreationChartPoints({ ...input, sessions: [draft], preview })[0]).toMatchObject({
      plannedLoad: 72,
      plannedLoadStatus: "partial",
    });
  });
});
