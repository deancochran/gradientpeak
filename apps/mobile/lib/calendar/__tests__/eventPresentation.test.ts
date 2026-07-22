import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/plan/dateGrouping", () => ({
  isActivityCompleted: (event: { completed?: boolean | null }) => event.completed === true,
}));

import {
  getEventPrimaryMeta,
  getEventStatusLabel,
  getEventSupportingLine,
  getEventTimeLabel,
} from "../eventPresentation";

const commonLoadProvenance = {
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  sport: "run" as const,
  method: "run_pace_threshold" as const,
  quality: {
    source: "validated_test" as const,
    observed_at: "2026-03-22T12:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "threshold-v1",
    evidence_fingerprint: "calendar-quality",
  },
  thresholdEvidence: {
    type: "threshold_speed_mps" as const,
    value: 4,
    unit: "meters_per_second" as const,
    source: "validated_test" as const,
    observedAt: "2026-03-22T12:00:00.000Z",
    validAt: "2026-03-22T12:00:00.000Z",
    freshness: "current" as const,
    calculationVersion: "threshold-v1",
    sourceFingerprint: "calendar-threshold",
  },
  evidenceFingerprint: "calendar-activity",
  computedAsOf: "2026-03-23T12:00:00.000Z",
};

function availableCommonLoad(load: number, intensity: number) {
  return {
    status: "available" as const,
    ...commonLoadProvenance,
    load,
    intensity,
    contributingDurationSeconds: 3600,
    estimated: false,
  };
}

describe("calendar event presentation", () => {
  it("builds rich planned-event metadata without extra badge noise", () => {
    const event = {
      id: "planned-1",
      event_type: "planned",
      starts_at: "2026-03-23T06:30:00.000Z",
      activity_plan: {
        id: "plan-1",
        activity_category: "outdoor_run",
        authoritative_metrics: {
          estimated_duration: 3600,
          estimated_tss: 72,
        },
        common_load: availableCommonLoad(64, 0.8),
        description: "Progressive tempo with a strong finish.",
      },
    };

    expect(getEventTimeLabel(event)).not.toBe("Scheduled");
    expect(getEventPrimaryMeta(event)).toEqual([
      "Outdoor Run",
      "~1h",
      "Load 64",
      "Intensity Tempo · 0.80",
    ]);
    expect(getEventSupportingLine(event)).toBe("Progressive tempo with a strong finish.");
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("prefers a single calm status label when planned activity is completed", () => {
    const event = {
      id: "planned-2",
      event_type: "planned",
      completed: true,
      recurrence_rule: "RRULE:FREQ=WEEKLY",
      activity_plan: {
        id: "plan-2",
        activity_category: "indoor_bike",
        authoritative_metrics: {
          estimated_tss: 88,
        },
        common_load: availableCommonLoad(56.25, 0.75),
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual([
      "Indoor Bike",
      "Load 56",
      "Intensity Tempo · 0.75",
    ]);
    expect(getEventStatusLabel(event)).toBe("Completed");
  });

  it("keeps non-planned events focused on time state and one supporting line", () => {
    const event = {
      id: "custom-1",
      event_type: "custom",
      all_day: true,
      notes: "Bring passport and race packet.",
      description: "Travel day",
    };

    expect(getEventTimeLabel(event)).toBe("All day");
    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventSupportingLine(event)).toBe("Bring passport and race packet.");
  });

  it("formats scheduled event times in the event timezone", () => {
    expect(
      getEventTimeLabel({
        id: "timezone-1",
        event_type: "custom",
        starts_at: "2026-06-02T16:30:00.000Z",
        timezone: "America/Los_Angeles",
      }),
    ).toBe("9:30 AM");
  });

  it("does not present planned-event metadata when no activity plan is associated", () => {
    const event = {
      id: "planned-without-plan",
      event_type: "planned",
      title: "Club meetup",
      completed: true,
      notes: "Bring lights.",
      activity_plan: null,
    };

    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventSupportingLine(event)).toBe("Bring lights.");
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("omits external and noncanonical load values instead of exposing legacy TSS", () => {
    const event = {
      id: "planned-external-load",
      event_type: "planned",
      activity_plan: {
        id: "plan-external-load",
        activity_category: "run",
        authoritative_metrics: { estimated_tss: 88 },
        common_load: 88,
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual(["Run"]);
    expect(getEventPrimaryMeta(event).join(" ")).not.toMatch(/TSS|\bIF\b/);
  });

  it("does not treat plan-shaped rows without an id as associated activity plans", () => {
    const event = {
      id: "planned-empty-plan",
      event_type: "planned",
      title: "Activity Plan - May 19, 2026 10:53 AM",
      completed: true,
      activity_plan: {
        activity_category: "run",
        authoritative_metrics: { estimated_tss: 55 },
      },
    };

    expect(getEventPrimaryMeta(event)).toEqual([]);
    expect(getEventStatusLabel(event)).toBeNull();
  });

  it("marks imported events as read-only without extra secondary badges", () => {
    const event = {
      id: "imported-1",
      event_type: "imported",
      starts_at: "2026-03-23T14:00:00.000Z",
      description: "Pulled in from provider sync.",
    };

    expect(getEventTimeLabel(event)).not.toBe("Scheduled");
    expect(getEventSupportingLine(event)).toBe("Pulled in from provider sync.");
    expect(getEventStatusLabel(event)).toBe("Read-only");
  });
});
