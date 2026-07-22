import { calculateAvailableCommonLoad } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  buildEffectivePlanMetricSummaries,
  buildEffectivePlanMetricSummary,
} from "./effectivePlanLoad";

const asOfInstant = "2026-07-21T12:00:00.000Z";

function commonLoad(durationSeconds: number, intensity: number) {
  return calculateAvailableCommonLoad({
    sport: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-20T12:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-power",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-20T12:00:00.000Z",
      validAt: "2026-07-20T12:00:00.000Z",
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-power",
    },
    evidenceFingerprint: `load-${durationSeconds}-${intensity}`,
    computedAsOf: asOfInstant,
    estimated: false,
    contributingDurationSeconds: durationSeconds,
    intensity,
  });
}

describe("mobile effective Plan Load adapter", () => {
  it("composes once and assigns linked replacements to their scheduled date", () => {
    const summaries = buildEffectivePlanMetricSummaries({
      asOfInstant,
      planningTimezone: "UTC",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      periods: [
        { key: "selected", startDate: "2026-07-21", endDate: "2026-07-21" },
        { key: "other", startDate: "2026-07-22", endDate: "2026-07-22" },
        { key: "gap", startDate: "2026-07-23", endDate: "2026-07-23" },
      ],
      scheduledEvents: [
        {
          id: "linked-plan",
          scheduled_date: "2026-07-22",
          linked_activity_id: "linked-activity",
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
      ],
      completedActivities: [
        {
          id: "linked-activity",
          started_at: "2026-07-21T08:00:00.000Z",
          derived: { stress: { common_load: commonLoad(1800, 1) } },
        },
        {
          id: "standalone",
          started_at: "2026-07-21T10:00:00.000Z",
          derived: { stress: { common_load: commonLoad(1800, 0.5) } },
        },
      ],
    });

    expect(summaries.get("selected")).toMatchObject({
      status: "complete",
      load: 12.5,
      completedLoad: 12.5,
    });
    expect(summaries.get("other")).toMatchObject({
      status: "complete",
      load: 50,
      completedLoad: 50,
    });
    expect(summaries.get("gap")).toMatchObject({ status: "known_zero", load: 0 });
  });

  it("preserves partial, unavailable gap, and known-zero source semantics by date", () => {
    const base = {
      asOfInstant,
      planningTimezone: "UTC",
      periods: [
        { key: "load", startDate: "2026-07-21", endDate: "2026-07-21" },
        { key: "gap", startDate: "2026-07-22", endDate: "2026-07-22" },
      ],
      scheduledEvents: [
        {
          id: "plan",
          scheduled_date: "2026-07-21",
          activity_plan: { common_load: commonLoad(1800, 1) },
        },
      ],
      completedActivities: [],
    };
    const partial = buildEffectivePlanMetricSummaries({
      ...base,
      completedSourceComplete: false,
      scheduledSourceComplete: true,
    });
    expect(partial.get("load")).toMatchObject({ status: "partial", load: 50 });
    expect(partial.get("gap")).toMatchObject({
      status: "unavailable",
      load: null,
      reason: "completed_source_incomplete",
    });

    const complete = buildEffectivePlanMetricSummaries({
      ...base,
      completedSourceComplete: true,
      scheduledSourceComplete: true,
    });
    expect(complete.get("gap")).toMatchObject({ status: "known_zero", load: 0 });
  });

  it("marks periods outside the fetched coverage as unavailable instead of known zero", () => {
    const summaries = buildEffectivePlanMetricSummaries({
      asOfInstant,
      planningTimezone: "UTC",
      coverageStartDate: "2026-07-20",
      coverageEndDate: "2026-07-22",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      periods: [
        { key: "covered", startDate: "2026-07-20", endDate: "2026-07-22" },
        { key: "before", startDate: "2026-07-13", endDate: "2026-07-19" },
        { key: "after", startDate: "2026-07-23", endDate: "2026-07-29" },
      ],
      scheduledEvents: [],
      completedActivities: [],
    });

    expect(summaries.get("covered")).toMatchObject({ status: "known_zero", load: 0 });
    expect(summaries.get("before")).toMatchObject({ status: "unavailable", load: null });
    expect(summaries.get("after")).toMatchObject({ status: "unavailable", load: null });
  });

  it("keeps an in-coverage scheduled replacement whose activity completed outside coverage", () => {
    const summaries = buildEffectivePlanMetricSummaries({
      asOfInstant,
      planningTimezone: "UTC",
      coverageStartDate: "2026-07-21",
      coverageEndDate: "2026-07-22",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      periods: [{ key: "scheduled", startDate: "2026-07-22", endDate: "2026-07-22" }],
      scheduledEvents: [
        {
          id: "linked-plan",
          scheduled_date: "2026-07-22",
          linked_activity_id: "early-completion",
          activity_plan: { common_load: commonLoad(3600, 0.5) },
        },
      ],
      completedActivities: [
        {
          id: "early-completion",
          started_at: "2026-07-20T08:00:00.000Z",
          derived: { stress: { common_load: commonLoad(1800, 1) } },
        },
      ],
    });

    expect(summaries.get("scheduled")).toMatchObject({
      status: "complete",
      load: 50,
      completedLoad: 50,
      remainingLoad: null,
    });
  });

  it("makes a linked period unavailable when the completed activity is outside fetched evidence", () => {
    const summaries = buildEffectivePlanMetricSummaries({
      asOfInstant,
      planningTimezone: "UTC",
      coverageStartDate: "2026-07-21",
      coverageEndDate: "2026-07-22",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      periods: [{ key: "scheduled", startDate: "2026-07-22", endDate: "2026-07-22" }],
      scheduledEvents: [
        {
          id: "linked-plan",
          scheduled_date: "2026-07-22",
          linked_activity_id: "outside-evidence",
          activity_plan: { common_load: commonLoad(3600, 0.5) },
        },
      ],
      completedActivities: [],
    });

    expect(summaries.get("scheduled")).toMatchObject({
      status: "unavailable",
      load: null,
      completedLoad: null,
      remainingLoad: null,
      hasUnavailableCompletedLoad: true,
    });
  });

  it("does not synthesize completed work for a cancelled event with a stale link", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "cancelled-plan",
          scheduled_date: "2026-07-21",
          linked_activity_id: "stale-link",
          status: "cancelled",
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
      ],
      completedActivities: [],
    });

    expect(summary).toMatchObject({ status: "known_zero", load: 0 });
  });

  it("does not collapse tentative work with unavailable common Load into known zero", () => {
    const onlyTentative = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "tentative-unknown",
          scheduled_date: "2026-07-21",
          tentative: true,
          activity_plan: {},
        },
      ],
      completedActivities: [],
    });

    expect(onlyTentative).toMatchObject({
      status: "unavailable",
      load: null,
      tentativeLoad: null,
      reason: "common_load_unavailable",
    });
  });

  it("marks known Load incomplete when tentative work has mixed common-Load evidence", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "planned-known",
          scheduled_date: "2026-07-21",
          activity_plan: { common_load: commonLoad(1800, 1) },
        },
        {
          id: "tentative-known",
          scheduled_date: "2026-07-21",
          tentative: true,
          activity_plan: { common_load: commonLoad(1800, 0.5) },
        },
        {
          id: "tentative-unknown",
          scheduled_date: "2026-07-21",
          tentative: true,
          activity_plan: {},
        },
      ],
      completedActivities: [],
    });

    expect(summary).toMatchObject({
      status: "partial",
      load: 50,
      remainingLoad: 50,
      tentativeLoad: 12.5,
      reason: "incomplete_common_load",
    });
  });

  it("replaces linked planned work and keeps standalone completed work", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-27",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "linked-plan",
          scheduled_date: "2026-07-22",
          linked_activity_id: "linked-activity",
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
        {
          id: "remaining-plan",
          scheduled_date: "2026-07-23",
          activity_plan: { common_load: commonLoad(3600, 0.5) },
        },
      ],
      completedActivities: [
        {
          id: "linked-activity",
          started_at: "2026-07-21T08:00:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(1800, 1) } },
        },
        {
          id: "standalone",
          started_at: "2026-07-21T10:00:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(1800, 0.5) } },
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "complete",
      completedLoad: 62.5,
      remainingLoad: 25,
      load: 87.5,
      hasUnavailableCompletedLoad: false,
    });
    expect(summary.intensity).toBeCloseTo(Math.sqrt(87.5 / 200), 12);
  });

  it("keeps completed activities visible as incomplete when common Load is absent", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [],
      completedActivities: [
        {
          id: "unknown-load",
          started_at: "2026-07-21T10:00:00.000Z",
          activity_type: "run",
          duration_seconds: 1800,
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "unavailable",
      load: null,
      intensity: null,
      hasUnavailableCompletedLoad: true,
      reason: "common_load_unavailable",
    });
  });

  it("keeps a day partial when known common Load coexists with unavailable work", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [],
      completedActivities: [
        {
          id: "known-load",
          started_at: "2026-07-21T09:00:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(1800, 1) } },
        },
        {
          id: "unknown-load",
          started_at: "2026-07-21T10:00:00.000Z",
          activity_type: "run",
          duration_seconds: 1800,
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "partial",
      load: 50,
      completedLoad: 50,
      hasUnavailableCompletedLoad: true,
      reason: "incomplete_common_load",
    });
  });

  it("uses the planning timezone when assigning completed activities", () => {
    const base = {
      asOfInstant: "2026-07-21T00:30:00.000Z",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [],
      completedActivities: [
        {
          id: "boundary",
          started_at: "2026-07-21T00:15:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(3600, 1) } },
        },
      ],
    };

    expect(
      buildEffectivePlanMetricSummary({ ...base, planningTimezone: "America/Los_Angeles" }).load,
    ).toBe(100);
    expect(
      buildEffectivePlanMetricSummary({ ...base, planningTimezone: "Asia/Tokyo" }),
    ).toMatchObject({ status: "known_zero", load: 0, intensity: null });
  });

  it("keeps completed events without activity evidence visible as unavailable", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "completed-without-link",
          scheduled_date: "2026-07-21",
          status: "completed",
          completed: true,
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
      ],
      completedActivities: [],
    });

    expect(summary).toMatchObject({
      status: "unavailable",
      load: null,
      intensity: null,
      hasUnavailableCompletedLoad: true,
    });
  });

  it("does not report known zero when the scheduled source is incomplete", () => {
    expect(
      buildEffectivePlanMetricSummary({
        asOfInstant,
        planningTimezone: "UTC",
        startDate: "2026-07-21",
        endDate: "2026-07-21",
        completedSourceComplete: true,
        scheduledSourceComplete: false,
        scheduledEvents: [],
        completedActivities: [],
      }),
    ).toMatchObject({ status: "unavailable", reason: "scheduled_source_incomplete" });
  });
});
