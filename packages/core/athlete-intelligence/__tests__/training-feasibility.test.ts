import { describe, expect, it } from "vitest";
import { sourceIdSchema } from "../lineage";
import {
  calculateTrainingFeasibility,
  TRAINING_FEASIBILITY_POLICY_VERSION,
  type TrainingFeasibilityInput,
} from "../policies/training-feasibility";

const policySource = sourceIdSchema.parse("manual:training-context-athlete-1");
const eventSource = (id: string) => sourceIdSchema.parse(`manual:schedule-${id}`);
function event(
  id: string,
  startAt: string,
  endAt: string,
  lifecycle: "planned" | "confirmed" | "completed" | "cancelled" = "planned",
) {
  return {
    sourceId: eventSource(id),
    startAt,
    endAt,
    lifecycle,
    eventType: "training" as const,
    sport: "cycling",
  };
}

function input(overrides: Partial<TrainingFeasibilityInput> = {}): TrainingFeasibilityInput {
  return {
    sourceId: policySource,
    assessmentAsOf: "2026-07-01T00:00:00Z",
    timezone: "Europe/London",
    planningStart: "2026-07-06T00:00:00Z",
    goalDate: "2026-07-12",
    availabilityWindows: [
      { day: "monday", startMinuteLocal: 480, endMinuteLocal: 600 },
      { day: "tuesday", startMinuteLocal: 480, endMinuteLocal: 600 },
      { day: "wednesday", startMinuteLocal: 480, endMinuteLocal: 600 },
    ],
    hardRestDays: ["sunday"],
    maximumWeeklyMinutes: 300,
    maximumWeeklySessions: 4,
    maximumDailyMinutes: 120,
    maximumSessionsPerDay: 2,
    maximumSessionDurationMinutes: 120,
    allowDoubleDays: true,
    sportOverrides: [],
    recoveryPreference: "balanced",
    requiredWeeklyMinutes: 300,
    requiredWeeklySessions: 3,
    plannedSchedule: [],
    ...overrides,
  };
}

describe("calculateTrainingFeasibility", () => {
  it("owns its immutable policy version and reports nonzero uncertainty", () => {
    const result = calculateTrainingFeasibility(input());
    expect(result.policyVersion).toBe(TRAINING_FEASIBILITY_POLICY_VERSION);
    expect(result.timeCoverage.uncertainty).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("loadFeasibility");
  });

  it("unions overlapping availability windows and responds to availability changes", () => {
    const overlap = calculateTrainingFeasibility(
      input({
        availabilityWindows: [
          { day: "monday", startMinuteLocal: 480, endMinuteLocal: 600 },
          { day: "monday", startMinuteLocal: 540, endMinuteLocal: 660 },
        ],
      }),
    );
    const changed = calculateTrainingFeasibility(
      input({
        availabilityWindows: [{ day: "monday", startMinuteLocal: 480, endMinuteLocal: 540 }],
      }),
    );
    expect(overlap.timeCoverage.estimate).toBe(0.6);
    expect(changed.timeCoverage.estimate).toBe(0.2);
  });

  it("honors timezone for local day constraints and rejects missing timezone", () => {
    const lateSundayUtc = event("local-monday", "2026-07-05T23:30:00Z", "2026-07-06T00:30:00Z");
    const london = calculateTrainingFeasibility(
      input({ planningStart: "2026-07-05T22:00:00Z", plannedSchedule: [lateSundayUtc] }),
    );
    const utc = calculateTrainingFeasibility(
      input({
        timezone: "UTC",
        planningStart: "2026-07-05T22:00:00Z",
        plannedSchedule: [lateSundayUtc],
      }),
    );
    const missing = calculateTrainingFeasibility(input({ timezone: null }));
    expect(london.constraints.hardRestConflicts.estimate).toBe(0);
    expect(utc.constraints.hardRestConflicts.estimate).toBe(1);
    expect(missing.timeCoverage.state).toBe("unsupported");
  });

  it("clips schedule minutes to a partial horizon", () => {
    const result = calculateTrainingFeasibility(
      input({
        planningStart: "2026-07-06T09:00:00Z",
        goalDate: "2026-07-06",
        requiredWeeklyMinutes: 420,
        requiredWeeklySessions: 7,
        availabilityWindows: [{ day: "monday", startMinuteLocal: 600, endMinuteLocal: 660 }],
        plannedSchedule: [event("partial", "2026-07-06T08:00:00Z", "2026-07-06T10:00:00Z")],
      }),
    );
    expect(result.scheduleCoverage.estimate).toBe(1);
    expect(result.requiredSessionCoverage.estimate).toBe(1);
  });

  it("bases schedule coverage on the portion overlapping unioned local availability", () => {
    const result = calculateTrainingFeasibility(
      input({
        requiredWeeklyMinutes: 60,
        availabilityWindows: [
          { day: "monday", startMinuteLocal: 540, endMinuteLocal: 600 },
          { day: "monday", startMinuteLocal: 570, endMinuteLocal: 630 },
        ],
        plannedSchedule: [
          event("partial", "2026-07-06T08:30:00Z", "2026-07-06T10:00:00Z"),
          event("outside", "2026-07-06T11:00:00Z", "2026-07-06T12:00:00Z"),
        ],
      }),
    );

    expect(result.compatibleScheduledMinutes.estimate).toBe(60);
    expect(result.scheduleCoverage.estimate).toBe(1);
  });

  it("matches cross-midnight sessions against each local day's availability", () => {
    const result = calculateTrainingFeasibility(
      input({
        timezone: "UTC",
        requiredWeeklyMinutes: 60,
        availabilityWindows: [
          { day: "monday", startMinuteLocal: 1410, endMinuteLocal: 1440 },
          { day: "tuesday", startMinuteLocal: 0, endMinuteLocal: 15 },
        ],
        plannedSchedule: [event("overnight", "2026-07-06T23:30:00Z", "2026-07-07T00:30:00Z")],
      }),
    );

    expect(result.compatibleScheduledMinutes.estimate).toBe(45);
    expect(result.scheduleCoverage.estimate).toBe(0.75);
  });

  it("uses the configured timezone when matching planned sessions to availability", () => {
    const schedule = [event("timezone", "2026-07-06T08:00:00Z", "2026-07-06T09:00:00Z")];
    const london = calculateTrainingFeasibility(
      input({
        requiredWeeklyMinutes: 420,
        availabilityWindows: [{ day: "monday", startMinuteLocal: 540, endMinuteLocal: 600 }],
        plannedSchedule: schedule,
      }),
    );
    const utc = calculateTrainingFeasibility(
      input({
        timezone: "UTC",
        requiredWeeklyMinutes: 420,
        availabilityWindows: [{ day: "monday", startMinuteLocal: 540, endMinuteLocal: 600 }],
        plannedSchedule: schedule,
      }),
    );

    expect(london.compatibleScheduledMinutes.estimate).toBe(60);
    expect(utc.compatibleScheduledMinutes.estimate).toBe(0);
  });

  it("uses requiredWeeklySessions independently from minute coverage", () => {
    const result = calculateTrainingFeasibility(
      input({
        requiredWeeklySessions: 4,
        plannedSchedule: [
          event("planned", "2026-07-06T08:00:00Z", "2026-07-06T09:00:00Z"),
          event("confirmed", "2026-07-07T08:00:00Z", "2026-07-07T09:00:00Z", "confirmed"),
        ],
      }),
    );
    expect(result.requiredSessionCoverage.estimate).toBe(0.5);
    expect(result.scheduleCoverage.estimate).toBe(0.4);
  });

  it("counts planned and confirmed lifecycle entries but excludes completed and cancelled", () => {
    const result = calculateTrainingFeasibility(
      input({
        plannedSchedule: [
          event("planned", "2026-07-06T08:00:00Z", "2026-07-06T09:00:00Z"),
          event("confirmed", "2026-07-07T08:00:00Z", "2026-07-07T09:00:00Z", "confirmed"),
          event("completed", "2026-07-08T08:00:00Z", "2026-07-08T09:00:00Z", "completed"),
          event("cancelled", "2026-07-09T08:00:00Z", "2026-07-09T09:00:00Z", "cancelled"),
        ],
      }),
    );
    expect(result.requiredSessionCoverage.estimate).toBeCloseTo(2 / 3);
    expect(result.scheduleCoverage.contributingSourceIds).not.toContain(eventSource("cancelled"));
  });

  it("reports maximum daily minute violations", () => {
    const result = calculateTrainingFeasibility(
      input({
        maximumDailyMinutes: 90,
        plannedSchedule: [
          event("one", "2026-07-06T08:00:00Z", "2026-07-06T09:00:00Z"),
          event("two", "2026-07-06T10:00:00Z", "2026-07-06T11:00:00Z"),
        ],
      }),
    );
    expect(result.constraints.dailyDurationExcesses.estimate).toBe(1);
  });

  it("treats balanced recovery preference only as a constraint", () => {
    const schedule = [
      event("one", "2026-07-06T08:00:00Z", "2026-07-06T09:00:00Z"),
      event("two", "2026-07-06T10:00:00Z", "2026-07-06T11:00:00Z"),
    ];
    const balanced = calculateTrainingFeasibility(input({ plannedSchedule: schedule }));
    const less = calculateTrainingFeasibility(
      input({ recoveryPreference: "less", plannedSchedule: schedule }),
    );
    expect(balanced.timeCoverage.estimate).toBe(less.timeCoverage.estimate);
    expect(balanced.scheduleCoverage.estimate).toBe(less.scheduleCoverage.estimate);
    expect(balanced.constraints.recoveryPreferenceConflicts.estimate).toBe(1);
    expect(less.constraints.recoveryPreferenceConflicts.estimate).toBe(0);
  });

  it("returns explicit unavailable constraint results for missing caps", () => {
    const result = calculateTrainingFeasibility(
      input({
        maximumWeeklyMinutes: null,
        maximumWeeklySessions: null,
        maximumDailyMinutes: null,
        maximumSessionsPerDay: null,
        maximumSessionDurationMinutes: null,
        allowDoubleDays: null,
      }),
    );
    expect(result.constraints.dailyDurationExcesses.state).toBe("insufficient_evidence");
    expect(result.constraints.weeklySessionCapExcesses.reasonCodes).toContain(
      "weekly_session_cap_missing",
    );
  });
});
