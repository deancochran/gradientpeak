import { describe, expect, it } from "vitest";
import type { PlannedSessionProjection } from "./planned-session";
import {
  buildPlannedSessionComparison,
  summarizePlannedSessionComparisons,
} from "./planned-session-comparison";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const session = (lifecycle: PlannedSessionProjection["lifecycle"]) => ({
  prescription: {
    capturedAt: "2026-09-01T00:00:00.000Z",
    resolutionManifest: {
      prescription_estimate: {
        duration: { status: "exact", value_seconds: 1800 },
        common_load: { status: "unavailable", value: null },
        rest_seconds: 0,
        has_open_completion: false,
        warnings: [],
        factors: [],
      },
    },
  },
  lifecycle,
});

describe("planned session comparisons", () => {
  it("keeps a completed manual session with no measurements actual-unknown", () => {
    const comparison = buildPlannedSessionComparison({
      session: session({
        status: "completed",
        completion: {
          state: "linked",
          activityId: id(4),
          linkedAt: "2026-09-14T00:00:00.000Z",
          outcome: "full",
        },
      }),
      actual: null,
    });
    expect(comparison.actual).toMatchObject({ state: "unknown", durationSeconds: null });
    expect(comparison.planned.durationSeconds).toBe(1800);
  });

  it("keeps measured linked observations separate from the frozen plan", () => {
    const comparison = buildPlannedSessionComparison({
      session: session({
        status: "completed",
        completion: {
          state: "linked",
          activityId: id(4),
          linkedAt: "2026-09-14T00:00:00.000Z",
          outcome: "full",
        },
      }),
      actual: { durationSeconds: 2100, distanceMeters: 5100 },
    });
    expect(comparison).toMatchObject({
      planned: { durationSeconds: 1800, distanceMeters: null },
      actual: { state: "observed", durationSeconds: 2100, distanceMeters: 5100 },
    });
  });

  it("does not count skipped sessions as actual work", () => {
    const summary = summarizePlannedSessionComparisons([
      buildPlannedSessionComparison({
        session: session({
          status: "completed",
          completion: {
            state: "skipped",
            skippedAt: "2026-09-14T00:00:00.000Z",
            operationId: id(5),
          },
        }),
        actual: null,
      }),
    ]);
    expect(summary.actual).toMatchObject({
      observedCount: 0,
      skippedCount: 1,
      durationSeconds: { value: null },
    });
  });

  it("labels aggregate observed totals partial when a measurement is missing", () => {
    const completed: PlannedSessionProjection["lifecycle"] = {
      status: "completed",
      completion: {
        state: "linked",
        activityId: id(4),
        linkedAt: "2026-09-14T00:00:00.000Z",
        outcome: "full",
      },
    };
    const summary = summarizePlannedSessionComparisons([
      buildPlannedSessionComparison({
        session: session(completed),
        actual: { durationSeconds: 1800, distanceMeters: 5000 },
      }),
      buildPlannedSessionComparison({
        session: session(completed),
        actual: { durationSeconds: null, distanceMeters: 3000 },
      }),
    ]);
    expect(summary.actual.durationSeconds).toEqual({ value: 1800, knownCount: 1, missingCount: 1 });
    expect(summary.actual.distanceMeters).toEqual({ value: 8000, knownCount: 2, missingCount: 0 });
  });
});
